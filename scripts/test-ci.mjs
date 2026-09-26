import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { availableParallelism, freemem, tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const durationsPath = resolve(root, 'tests/durations.json')
const nodeFlags = ['--experimental-strip-types', '--test', '--test-reporter=tap', '--test-reporter-destination=stdout']
const locationPatterns = [
  /^\s*location: '(.+?):\d+:\d+'\s*$/gm,
  /^\s*test at (.+?):\d+:\d+\s*$/gm,
]
const gigabyte = 1024 ** 3

function runTests(files, concurrency, recordTo) {
  const preload = process.env.CITROPY_TEST_APP_URL ? [`--import=${pathToFileURL(resolve(root, 'tests/fast-animations.mjs')).href}`] : []
  const recording = recordTo ? [`--test-reporter=${import.meta.url}`, `--test-reporter-destination=${recordTo}`] : []
  return new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [...preload, ...nodeFlags, ...recording, `--test-concurrency=${concurrency}`, ...files], {
      cwd: root,
      stdio: ['inherit', 'pipe', 'inherit'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk)
      output += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolveRun({ code, output }))
  })
}

/** Node test reporter that sums top-level test time per file, in seconds. */
export default async function* fileDurations(source) {
  const seconds = {}
  for await (const event of source) {
    if ((event.type !== 'test:pass' && event.type !== 'test:fail') || event.data.nesting !== 0 || !event.data.file) continue
    const file = relative(root, event.data.file).replaceAll('\\', '/')
    seconds[file] = (seconds[file] ?? 0) + event.data.details.duration_ms / 1000
  }
  yield JSON.stringify(seconds)
}

/** Order files slowest first, using recorded durations and the median for unrecorded files. */
export function weighFiles(files, durations) {
  const known = files.map((file) => durations[file]).filter((value) => value !== undefined).sort((a, b) => a - b)
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1
  return files
    .map((file) => ({ file, weight: durations[file] ?? fallback }))
    .sort((a, b) => b.weight - a.weight || (a.file < b.file ? -1 : 1))
}

/** Assign each file to the lightest shard, heaviest files first. */
export function shardFiles(weighted, index, total) {
  const loads = Array(total).fill(0)
  const selected = []
  for (const { file, weight } of weighted) {
    const lightest = loads.indexOf(Math.min(...loads))
    loads[lightest] += weight
    if (lightest === index - 1) selected.push(file)
  }
  return selected
}

/** Parallel files for this machine: at most half the cores, with 2 GB per file and 4 GB left free. */
export function localConcurrency(cores = availableParallelism(), free = freemem()) {
  return Math.max(1, Math.min(Math.floor(cores / 2), Math.floor((free - 4 * gigabyte) / (2 * gigabyte))))
}

/** Start the app once for every browser test file and load it so its modules are compiled before tests begin. */
async function startSharedApp() {
  const { startAppServer } = await import(pathToFileURL(resolve(root, 'tests/app-server.mjs')).href)
  const { chromium } = await import('playwright')
  const app = await startAppServer()
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  await page.route('**/api/**', (route) => route.fulfill({ json: {} }))
  await page.routeWebSocket('**/socket', () => {})
  await page.goto(app.url, { timeout: 120_000 })
  await page.locator('#root > *').first().waitFor({ timeout: 120_000 })
  await browser.close()
  return app
}

/** Extract unique in-repository test filenames from TAP diagnostics for diagnostic retries. */
export function failedTestFiles(output, from = root) {
  const files = new Set()
  for (const pattern of locationPatterns) {
    for (const [, location] of output.matchAll(pattern)) {
      try {
        const path = location.startsWith('file:') ? fileURLToPath(location) : resolve(from, location)
        const file = relative(from, path).replaceAll('\\', '/')
        if (/^tests\/[^/]+\.test\.mjs$/.test(file)) files.add(file)
      } catch {
        // Malformed diagnostic locations are not executable test paths.
      }
    }
  }
  return [...files]
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    'test-shard': { type: 'string' },
    concurrency: { type: 'string' },
    'record-durations': { type: 'boolean' },
  } })
  const allFiles = readdirSync(resolve(root, 'tests'))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => `tests/${name}`)

  if (allFiles.length === 0) {
    console.error('No test files found. CI cannot validate an empty suite.')
    process.exit(1)
  }

  const shard = values['test-shard']
  let shardIndex = 1
  let shardTotal = 1
  if (shard !== undefined) {
    ;[shardIndex, shardTotal] = shard.split('/').map(Number)
    if (!/^[1-9]\d*\/[1-9]\d*$/.test(shard) || shardIndex > shardTotal || shardTotal > allFiles.length) {
      console.error(`Invalid test shard "${shard}": expected INDEX/TOTAL with 1 <= INDEX <= TOTAL <= ${allFiles.length}.`)
      process.exit(1)
    }
  }

  const durations = existsSync(durationsPath) ? JSON.parse(readFileSync(durationsPath, 'utf8')) : {}
  const files = shardFiles(weighFiles(allFiles, durations), shardIndex, shardTotal)
  const concurrency = values.concurrency ? Number(values.concurrency) : process.env.CI ? 2 : localConcurrency()
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    console.error(`Invalid concurrency "${values.concurrency}": expected a positive whole number.`)
    process.exit(1)
  }
  console.error(`Running ${files.length} test file(s), ${concurrency} at a time.`)

  const usesApp = files.some((file) => readFileSync(resolve(root, file), 'utf8').includes('./app-server.mjs'))
  const app = usesApp ? await startSharedApp() : undefined
  if (app) process.env.CITROPY_TEST_APP_URL = app.url

  const recordTo = values['record-durations'] ? join(tmpdir(), `citropy-durations-${process.pid}.json`) : undefined
  const first = await runTests(files, concurrency, recordTo)
  if (recordTo) {
    const measured = JSON.parse(readFileSync(recordTo, 'utf8'))
    rmSync(recordTo)
    const merged = { ...durations }
    for (const [file, seconds] of Object.entries(measured)) merged[file] = Math.round(seconds * 10) / 10
    const sorted = Object.fromEntries(Object.entries(merged).filter(([file]) => allFiles.includes(file)).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(durationsPath, `${JSON.stringify(sorted, null, 2)}\n`)
    console.error(`Recorded durations for ${Object.keys(measured).length} file(s) in tests/durations.json.`)
  }
  const failed = first.code === 0 ? [] : failedTestFiles(first.output)
  const code = first.code === 0 ? 0 : 1
  if (failed.length) {
    console.log(`\nRetrying ${failed.length} test file(s) after a first failure: ${failed.join(' ')}\n`)
    const retry = await runTests(failed, 1)
    console.log(retry.code !== 0
      ? '\nRetry failed. Both runs failed for the files above.'
      : '\nRetries passed, but CI remains failed. Fix the first-run failure; retries are diagnostic only.')
  }
  await app?.close()
  process.exit(code)
}
