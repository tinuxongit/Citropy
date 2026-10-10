import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { framedVisual } from "../server/tool-visuals.ts";
import { composeArt } from "./readme-art/compose.mjs";

const DESKTOP = { width: 1600, height: 1000 };
const PHONE = { width: 390, height: 844 };
const DESKTOP_SCALE = 2;
const PHONE_SCALE = 3;
const BACKGROUNDS = { dark: "ascii", light: "dots" };

const root = fileURLToPath(new URL("..", import.meta.url));
const assets = join(root, "docs/assets");
const directory = await mkdtemp(join(tmpdir(), "citropy-screenshots-"));
const captures = join(directory, "captures");

const now = Date.now();
const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

const providers = [
  {
    id: "claude",
    label: "Claude Code",
    available: true,
    enabled: true,
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5", isDefault: true, efforts: ["low", "medium", "high", "xhigh"], defaultEffort: "high", contextMax: 200000 },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5", efforts: ["low", "medium", "high"], contextMax: 200000 },
    ],
  },
  {
    id: "codex",
    label: "Codex",
    available: true,
    enabled: true,
    models: [
      { id: "gpt-5.5", label: "GPT-5.5", isDefault: true, efforts: ["low", "medium", "high"], contextMax: 400000 },
    ],
  },
  {
    id: "opencode",
    label: "OpenCode",
    available: true,
    enabled: true,
    models: [
      { id: "kimi-k2.5", label: "Kimi K2.5", isDefault: true, contextMax: 200000 },
    ],
  },
  {
    id: "antigravity",
    label: "Antigravity",
    available: true,
    enabled: true,
    models: [
      { id: "gemini-3.5-pro", label: "Gemini 3.5 Pro", isDefault: true, efforts: ["low", "high"], defaultEffort: "high", contextMax: 1000000 },
    ],
  },
];

const usage = (turns = 0) => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, contextTokens: 0, contextMax: 200000, turns });

const thread = (id, title, provider, model, extra = {}) => ({
  id,
  projectId: "workspace",
  provider,
  model,
  title,
  permissionMode: "manual",
  createdAt: now - 6 * day,
  updatedAt: now - minute,
  status: "idle",
  running: false,
  usage: usage(),
  ...extra,
});

const threads = [
  thread("rainfall", "Add hourly rainfall chart", "claude", "claude-opus-5", {
    externalId: "session-rainfall",
    effort: "high",
    permissionMode: "acceptEdits",
    updatedAt: now - 4 * minute,
    usage: { input: 280000, output: 1900, cacheRead: 100000, cacheWrite: 2000, costUsd: 4.3, contextTokens: 62000, contextMax: 200000, turns: 4 },
  }),
  thread("frost", "Frost alert thresholds", "claude", "claude-opus-5", { pinned: true, updatedAt: now - 2 * hour }),
  thread("humidity", "Debounce flaky humidity sensor", "codex", "gpt-5.5", { updatedAt: now - 5 * hour }),
  thread("csv", "CSV export for station logs", "opencode", "kimi-k2.5", { updatedAt: now - day }),
  thread("forecast", "Sketch the forecast page", "antigravity", "gemini-3.5-pro", { updatedAt: now - 30 * hour }),
  thread("ci", "Speed up CI test matrix", "codex", "gpt-5.5", { updatedAt: now - 2 * day }),
  thread("units", "Metric and imperial toggle", "claude", "claude-opus-5", { updatedAt: now - 3 * day }),
];

const project = { id: "workspace", name: "weather-station", path: "/home/dev/code/weather-station", isGit: true, lastOpened: 1 };

const snapshot = (extra = {}) => ({
  home: "/home/dev",
  projects: [project],
  threads,
  providers,
  permissions: [],
  assistance: { automaticTitles: false, commitModel: null, titleModel: null, reviewModel: null },
  ...extra,
});

const text = (id, body) => ({ id, kind: "text", text: body, complete: true });
const tool = (id, name, shape, headline) => ({
  id,
  kind: "tool",
  callId: `call-${id}`,
  name,
  shape,
  headline,
  input: {},
  status: "ok",
  startedAt: now - 40 * minute,
  endedAt: now - 38 * minute,
  output: "Done.",
});

const chatMessages = [
  {
    id: "question",
    role: "user",
    ts: now - 45 * minute,
    parts: [text("question-text", "Add an hourly rainfall chart to the dashboard. Missing hours should show as zero, not gaps.")],
  },
  {
    id: "answer",
    role: "assistant",
    ts: now - 40 * minute,
    parts: [
      tool("read-1", "Read", "read", "dashboard.tsx"),
      tool("read-2", "Read", "read", "readings.ts"),
      tool("search-1", "Grep", "search", "bucketByHour"),
      tool("edit-1", "Edit", "edit", "dashboard.tsx"),
      tool("command-1", "Bash", "command", "npm test"),
      text(
        "answer-text",
        `Added an hourly rainfall chart to the station dashboard.

- \`bucketByHour\` groups raw readings into hourly totals and fills empty hours with zero, so gaps in the sensor feed show as flat bars instead of disappearing.
- \`RainfallChart\` renders the buckets as bars scaled to the day's peak, with the current hour highlighted.
- The dashboard shows the chart under the temperature graph and reuses its time range picker.

\`\`\`ts
export function bucketByHour(readings: Reading[], field: "rainfall") {
  const buckets = new Map<number, number>();
  for (const reading of readings) {
    const hour = startOfHour(reading.at);
    buckets.set(hour, (buckets.get(hour) ?? 0) + reading[field]);
  }
  return fillHours(buckets);
}
\`\`\`

All 38 tests pass, including 4 new ones for empty hours and daylight-saving transitions.`,
      ),
    ],
  },
];

const gitStatus = {
  branch: "feat/rainfall-chart",
  upstream: "origin/feat/rainfall-chart",
  ahead: 2,
  behind: 0,
  clean: false,
  files: [
    { path: "src/dashboard/RainfallChart.tsx", index: "A", work: " ", added: 84, removed: 0, staged: true, untracked: false },
    { path: "src/lib/buckets.ts", index: "M", work: "M", added: 31, removed: 6, staged: false, untracked: false },
    { path: "src/dashboard/TemperatureGraph.tsx", index: "M", work: " ", added: 12, removed: 3, staged: true, untracked: false },
    { path: "tests/buckets.test.ts", index: "?", work: "?", added: 58, removed: 0, staged: false, untracked: true },
    { path: "docs/charts.md", index: "D", work: " ", added: 0, removed: 22, staged: true, untracked: false },
  ],
};

const gitOverview = {
  repository: true,
  hasCommits: true,
  mergeInProgress: false,
  status: gitStatus,
  branches: [
    { name: "feat/rainfall-chart", current: true, remote: false, upstream: "origin/feat/rainfall-chart", subject: "Fill empty hours with zero", date: new Date(now - hour).toISOString() },
    { name: "main", current: false, remote: false, upstream: "origin/main", subject: "Release 1.4.0", date: new Date(now - 2 * day).toISOString() },
  ],
  commits: [
    { hash: "4f1c9ad", author: "Dev", date: new Date(now - hour).toISOString(), subject: "Fill empty hours with zero", refs: "HEAD -> feat/rainfall-chart" },
    { hash: "b82e017", author: "Dev", date: new Date(now - 3 * hour).toISOString(), subject: "Add bucketByHour", refs: "" },
  ],
  remotes: [{ name: "origin", url: "git@github.com:dev/weather-station.git" }],
  stashes: [],
};

const gitPatch = {
  path: "src/lib/buckets.ts",
  added: 31,
  removed: 6,
  hunks: [
    {
      header: "@@ -12,10 +12,16 @@ import type { Reading } from \"./readings\";",
      oldStart: 12,
      newStart: 12,
      lines: [
        { type: "ctx", text: "", oldNo: 12, newNo: 12 },
        { type: "ctx", text: "export function bucketByHour(", oldNo: 13, newNo: 13 },
        { type: "del", text: "  readings: Reading[],", oldNo: 14 },
        { type: "add", text: "  readings: Reading[],", newNo: 14 },
        { type: "add", text: "  field: keyof Reading = \"rainfall\",", newNo: 15 },
        { type: "ctx", text: ") {", oldNo: 15, newNo: 16 },
        { type: "ctx", text: "  const buckets = new Map<number, number>();", oldNo: 16, newNo: 17 },
        { type: "del", text: "  for (const reading of readings) buckets.set(startOfHour(reading.at), reading[field]);", oldNo: 17 },
        { type: "add", text: "  for (const reading of readings) {", newNo: 18 },
        { type: "add", text: "    const hour = startOfHour(reading.at);", newNo: 19 },
        { type: "add", text: "    buckets.set(hour, (buckets.get(hour) ?? 0) + reading[field]);", newNo: 20 },
        { type: "add", text: "  }", newNo: 21 },
        { type: "ctx", text: "  return fillHours(buckets);", oldNo: 18, newNo: 22 },
        { type: "ctx", text: "}", oldNo: 19, newNo: 23 },
      ],
    },
    {
      header: "@@ -28,3 +34,12 @@ export function fillHours(",
      oldStart: 28,
      newStart: 34,
      lines: [
        { type: "ctx", text: "  for (let hour = start; hour <= end; hour += HOUR) {", oldNo: 28, newNo: 34 },
        { type: "del", text: "    if (!buckets.has(hour)) continue;", oldNo: 29 },
        { type: "add", text: "    if (!buckets.has(hour)) buckets.set(hour, 0);", newNo: 35 },
        { type: "ctx", text: "    filled.set(hour, buckets.get(hour) ?? 0);", oldNo: 30, newNo: 36 },
        { type: "ctx", text: "  }", oldNo: 31, newNo: 37 },
      ],
    },
  ],
};

const usageDay = (offset) => {
  const date = new Date(now - offset * day);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const usageHistory = Array.from({ length: 120 }, (_, offset) => [
  ["claude", "claude-opus-5", 2.4],
  ["codex", "gpt-5.5-codex", 1.3],
  ["opencode", "kimi-k2.5", 0.5],
].flatMap(([provider, model, weight], index) => {
  const wave = (Math.sin(offset * 0.7 + index * 2) + 1.3) * weight * (offset % 7 === 5 || offset % 7 === 6 ? 0.35 : 1);
  if (wave < 0.4) return [];
  const input = Math.round(wave * 180000);
  return [{ day: usageDay(offset), provider, model, input, output: Math.round(input * 0.08), cacheRead: provider === "codex" ? Math.round(input * 0.6) : Math.round(input * 3), cacheWrite: Math.round(input * 0.2), costUsd: provider === "claude" ? Math.round(wave * 180) / 100 : 0, turns: Math.round(wave * 6) + 1 }];
})).flat();

const usageReport = {
  totals: { input: 1284000, output: 192000, cacheRead: 6420000, cacheWrite: 512000, costUsd: 0 },
  history: usageHistory,
  pricing: { fetchedAt: now },
  providers: [
    {
      provider: "claude",
      updatedAt: now - 2 * minute,
      windows: [
        { label: "5 hours", usedPercent: 62, resetsAt: now + 2 * hour + 10 * minute },
        { label: "Weekly", usedPercent: 38, resetsAt: now + 3 * day + 5 * hour },
      ],
    },
    {
      provider: "codex",
      updatedAt: now - 2 * minute,
      windows: [{ label: "Weekly", usedPercent: 81, resetsAt: now + 2 * day + 4 * hour }],
    },
  ],
  conversations: threads.map((entry) => ({
    id: entry.id,
    title: entry.title,
    projectId: entry.projectId,
    provider: entry.provider,
    model: entry.model,
    usage: entry.usage,
    updatedAt: entry.updatedAt,
  })),
};

const dashboardHtml = `<!doctype html>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #10171c; color: #e8eef2; font: 14px/1.5 Inter, system-ui, sans-serif; }
  header { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; background: #16222a; border-bottom: 1px solid #22313b; }
  h1 { margin: 0; font-size: 15px; font-weight: 600; }
  .dot { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: #5ec8a0; }
  header span { color: #7b8f9c; font-size: 12px; }
  main { display: grid; gap: 12px; padding: 16px; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .card { padding: 14px; background: #17242c; border: 1px solid #22313b; border-radius: 12px; }
  .card h2 { margin: 0 0 6px; color: #8fa3b0; font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
  .value { font-size: 22px; font-weight: 600; }
  .value small { color: #8fa3b0; font-size: 12px; font-weight: 400; }
  .bars { display: flex; align-items: flex-end; gap: 4px; height: 190px; margin-top: 10px; }
  .bars span { flex: 1; background: linear-gradient(180deg, #4fb3e8, #2d7fb8); border-radius: 3px 3px 0 0; }
  .axis { display: flex; justify-content: space-between; margin-top: 8px; color: #7b8f9c; font-size: 11px; }
  .reading { display: flex; justify-content: space-between; padding: 9px 0; border-top: 1px solid #22313b; color: #a8b8c6; }
  .reading strong { color: #e8eef2; font-weight: 500; }
</style>
<header><h1><span class="dot"></span>Cedar Ridge</h1><span>2 min ago</span></header>
<main>
  <div class="stats">
    <div class="card"><h2>Temp</h2><div class="value">14.2<small>°C</small></div></div>
    <div class="card"><h2>Humidity</h2><div class="value">68<small>%</small></div></div>
    <div class="card"><h2>Rain</h2><div class="value">12.4<small>mm</small></div></div>
  </div>
  <div class="card">
    <h2>Rainfall by hour</h2>
    <div class="bars">${[22, 40, 64, 88, 52, 30, 46, 72, 96, 60, 38, 24, 48, 78, 58, 34, 20, 26, 52, 40, 28, 16, 34, 22].map((height) => `<span style="height:${height}%"></span>`).join("")}</div>
    <div class="axis"><span>00:00</span><span>12:00</span><span>24:00</span></div>
  </div>
  <div class="card">
    <h2>Latest readings</h2>
    <div class="reading"><span>Wind gust</span><strong>24.6 km/h</strong></div>
    <div class="reading"><span>Pressure</span><strong>1013 hPa</strong></div>
    <div class="reading"><span>Battery</span><strong>87%</strong></div>
  </div>
</main>`;

const questions = [
  {
    id: "missing",
    question: "How should missing hours appear on the chart?",
    options: [
      { label: "Zero bars", description: "Keep the time axis continuous with empty hours at zero." },
      { label: "Skip the hour", description: "Compress gaps so only recorded hours are shown." },
    ],
    multiple: false,
  },
  {
    id: "range",
    question: "Which time range should the chart open with?",
    options: [{ label: "Last 24 hours" }, { label: "Last 7 days" }, { label: "Match the temperature graph" }],
    multiple: true,
  },
];

const questionRequest = { id: "request", threadId: "rainfall", messageId: "answer", questions, createdAt: now };
const questionThread = { ...threads[0], running: true, status: "awaiting" };
const questionMessages = [
  { id: "prompt", role: "user", ts: now - minute, parts: [text("prompt-text", "Add the rainfall chart to the dashboard.")] },
  {
    id: "answer",
    role: "assistant",
    ts: now,
    parts: [
      { id: "question-tool", kind: "tool", name: "question", shape: "generic", headline: "question", status: "running", input: { questions } },
      { id: "request", kind: "question", questions, status: "pending" },
    ],
  },
];

const editorTree = {
  "": [
    { path: "src", name: "src", dir: true },
    { path: "tests", name: "tests", dir: true },
    { path: "package.json", name: "package.json", dir: false },
    { path: "README.md", name: "README.md", dir: false },
  ],
  src: [
    { path: "src/dashboard", name: "dashboard", dir: true },
    { path: "src/lib", name: "lib", dir: true },
    { path: "src/main.tsx", name: "main.tsx", dir: false },
  ],
  "src/dashboard": [
    { path: "src/dashboard/Dashboard.tsx", name: "Dashboard.tsx", dir: false },
    { path: "src/dashboard/RainfallChart.tsx", name: "RainfallChart.tsx", dir: false },
    { path: "src/dashboard/TemperatureGraph.tsx", name: "TemperatureGraph.tsx", dir: false },
  ],
};

const rainfallChartSource = `import { useMemo } from "react";
import { bucketByHour } from "../lib/buckets";
import type { Reading } from "../lib/readings";

export function RainfallChart({ readings, now }: { readings: Reading[]; now: number }) {
  const buckets = useMemo(() => bucketByHour(readings, "rainfall"), [readings]);
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.total));
  const currentHour = new Date(now).getHours();

  return (
    <figure className="rainfall-chart">
      <figcaption>Rainfall by hour</figcaption>
      <div className="bars">
        {buckets.map((bucket) => (
          <span
            key={bucket.hour}
            className={bucket.hour === currentHour ? "bar current" : "bar"}
            style={{ height: \`\${(bucket.total / peak) * 100}%\` }}
            title={\`\${bucket.total.toFixed(1)} mm\`}
          />
        ))}
      </div>
      <div className="axis">
        <span>00:00</span>
        <span>12:00</span>
        <span>24:00</span>
      </div>
    </figure>
  );
}
`;

const visualId = "5f0c2a8e-7d1b-4c3a-9e2f-1b6d8a4c0e57";
const weekRain = [
  ["Mon", 4.2, 1.1],
  ["Tue", 12.8, 3.4],
  ["Wed", 7.5, 6.2],
  ["Thu", 18.4, 2.8],
  ["Fri", 9.1, 0.4],
  ["Sat", 2.3, 5.9],
  ["Sun", 6.7, 2.2],
];
const rainPeak = Math.max(...weekRain.flatMap(([, now, before]) => [now, before]));

const visualHtml = `<!doctype html>
<style>
  * { box-sizing: border-box; }
  .card { padding: 22px 24px 20px; border: 1px solid var(--citropy-line); border-radius: 16px; background: var(--citropy-surface); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  h1 { margin: 0; font-size: 16px; font-weight: 600; }
  header span { color: var(--citropy-muted); font-size: 12px; }
  .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0 20px; }
  .total { padding: 12px 14px; border-radius: 12px; background: var(--citropy-background); }
  .total small { display: block; color: var(--citropy-muted); font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; }
  .total strong { font-size: 24px; font-weight: 600; }
  .total em { margin-left: 6px; color: #3fb68b; font-size: 12px; font-style: normal; }
  .chart { display: grid; grid-template-columns: repeat(7, 1fr); gap: 14px; align-items: end; height: 170px; }
  .day { display: grid; grid-template-rows: 1fr auto; gap: 8px; height: 100%; }
  .pair { display: flex; gap: 4px; align-items: end; }
  .pair span { flex: 1; border-radius: 5px 5px 2px 2px; }
  .now { background: linear-gradient(180deg, #59b8f0, #2f7fd0); }
  .before { background: var(--citropy-line); }
  .day small { color: var(--citropy-muted); font-size: 11px; text-align: center; }
  .legend { display: flex; gap: 16px; margin-top: 14px; color: var(--citropy-muted); font-size: 12px; }
  .legend i { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 3px; vertical-align: -1px; }
</style>
<div class="card">
  <header><h1>Rainfall, this week and last</h1><span>Cedar Ridge station</span></header>
  <div class="totals">
    <div class="total"><small>This week</small><strong>61.0</strong> mm<em>+39.0</em></div>
    <div class="total"><small>Wettest day</small><strong>Thu</strong> 18.4 mm</div>
    <div class="total"><small>Dry hours</small><strong>131</strong> of 168</div>
  </div>
  <div class="chart">${weekRain.map(([label, current, before]) => `<div class="day"><div class="pair"><span class="now" style="height:${(current / rainPeak) * 140}px"></span><span class="before" style="height:${(before / rainPeak) * 140}px"></span></div><small>${label}</small></div>`).join("")}</div>
  <div class="legend"><span><i class="now"></i>This week</span><span><i class="before"></i>Last week</span></div>
</div>`;

const visualMessages = [
  { id: "visual-question", role: "user", ts: now - 6 * minute, parts: [text("visual-question-text", "How does this week's rain compare with last week?")] },
  {
    id: "visual-answer",
    role: "assistant",
    ts: now - 5 * minute,
    parts: [
      tool("visual-read", "Read", "read", "readings.ts"),
      text("visual-answer-text", `This week was much wetter, 61 mm against 22 mm, and most of it fell on Tuesday and Thursday.\n\n![Rainfall this week and last](citropy-visual:${visualId})\n\nSaturday is the only day that was drier than last week.`),
    ],
  },
];

const sharingState = {
  enabled: true,
  addresses: ["192.168.1.24:4180"],
  devices: [{ id: "pixel", name: "Pixel 9", createdAt: now - 3 * day, lastSeen: now - 12 * minute }],
};

const ok = (route) => route.fulfill({ json: [] });

async function visualPage(route) {
  if (new URL(route.request().url()).pathname !== "/api/visual-pages") return;
  await route.fulfill({ contentType: "text/html", body: framedVisual(visualHtml) });
  return true;
}

async function waitForVisual(page) {
  await page.locator("iframe.markdown-visual").waitFor();
  await page.frameLocator("iframe.markdown-visual").getByText("Rainfall, this week and last").waitFor();
  await page.waitForFunction(() => document.querySelector("iframe.markdown-visual")?.style.height);
}

async function main() {
  const server = await createServer({
    configFile: false,
    cacheDir: join(directory, "cache"),
    root,
    plugins: [react()],
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, watch: null },
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });

  async function image(html, width, height, scale = 2) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale });
    await page.setContent(html);
    const data = (await page.screenshot({ type: "jpeg", quality: 90 })).toString("base64");
    await page.close();
    return data;
  }

  async function shot(name, theme, { preferences = {}, snapshot: data = snapshot(), desktop, phone = false, regions = {}, onMessage, api, boot, act } = {}) {
    const page = await browser.newPage({
      viewport: phone ? PHONE : DESKTOP,
      deviceScaleFactor: phone ? PHONE_SCALE : DESKTOP_SCALE,
      isMobile: phone,
      hasTouch: phone,
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript(
      ({ values, theme, background }) => {
        if (window !== window.top) return;
        for (const [key, value] of Object.entries({ project: "workspace", thread: "rainfall", inspector: "0", uiScale: "100", stageBackground: background, ...values }))
          localStorage.setItem(`citropy.${key}`, String(value));
        localStorage.setItem("citropy.scheme", theme);
      },
      { values: preferences, theme, background: BACKGROUNDS[theme] },
    );
    if (desktop)
      await page.addInitScript((mode) => {
        const listeners = new Set();
        const state = { activeId: "local", endpoint: "", connections: [] };
        if (mode === "workspaces")
          state.connections = [
            { id: "vps", name: "citropy-vps", target: "deploy@10.0.4", port: 22, node: "node", status: "connected" },
            { kind: "container", id: "sandbox", name: "sandbox", target: "Docker", port: 0, node: "node", status: "disconnected" },
          ];
        window.citropyDesktop = {
          windowState: async () => ({ platform: "linux", maximized: false, fullscreen: false, development: false, version: "0.1.0" }),
          windowCommand: async () => {},
          onWindowState: () => () => {},
          onNotification: () => () => {},
          onBrowserSelect: () => () => {},
          onAddressFocus: () => () => {},
          browserBounds: async () => {},
          onBrowserCover: (callback) => {
            window.__browserCover = callback;
            return () => {};
          },
          environmentsState: async () => state,
          onEnvironmentsState: (callback) => {
            listeners.add(callback);
            return () => listeners.delete(callback);
          },
          sshHosts: async () => (mode === "workspaces" ? ["buildbox", "staging"] : []),
          connectEnvironment: async () => state,
          disconnectEnvironment: async () => {},
          saveEnvironment: async (input) => ({ ...input, id: "new-ssh" }),
          removeEnvironment: async () => {},
          chooseWorkspaceFolder: async () => "/home/dev/weather-station",
          configureProjectDefaults: async (settings) => settings,
          updateState: async () => ({ status: "idle", version: "0.1.0" }),
          onUpdateState: () => () => {},
        };
      }, desktop);
    let socket;
    await page.routeWebSocket("**/socket*", (connection) => {
      socket = connection;
      connection.onMessage((raw) => onMessage?.(JSON.parse(raw), connection));
      connection.send(JSON.stringify({ t: "hello", snapshot: data }));
    });
    await page.route("**/api/**", async (route) => {
      const result = api ? await api(route, () => socket) : undefined;
      if (result === true) return;
      if (result) return route.fulfill({ json: result });
      const path = new URL(route.request().url()).pathname;
      if (["/api/skills", "/api/commands"].includes(path)) return ok(route);
      return route.fulfill({ status: 404, json: { error: "screenshot route" } });
    });
    await page.goto(server.resolvedUrls.local[0]);
    try {
      await boot?.(page, () => socket);
      await act?.(page, () => socket);
    } catch (error) {
      throw new Error(`${name}-${theme}: ${errors.join(" | ") || (await page.locator("body").innerText()).slice(0, 300)}`, { cause: error });
    }
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(captures, `${name}-${theme}.png`), animations: "disabled" });
    const boxes = {};
    for (const [region, selector] of Object.entries(regions)) boxes[region] = await page.locator(selector).first().boundingBox();
    await writeFile(join(captures, `${name}-${theme}.json`), JSON.stringify({ ...page.viewportSize(), regions: boxes }));
    if (errors.length) throw new Error(`${name}-${theme}: ${errors.join(" | ")}`);
    await page.close();
  }

  const scenes = {
    async chat(theme) {
      await shot("chat", theme, {
        regions: { threads: ".thread-list" },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        boot: async (page) => {
          await page.locator(".turn").first().waitFor();
          await page.getByText("All 38 tests pass", { exact: false }).waitFor();
        },
      });
    },

    async picker(theme) {
      await shot("picker", theme, {
        regions: Object.fromEntries([["menu", ".model-picker-menu"], ...providers.map((provider) => [provider.id, `.model-picker-menu button:has-text("${provider.label}")`])]),
        preferences: { thread: "frost" },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: [] }));
        },
        act: async (page) => {
          await page.locator('button[aria-haspopup="menu"]', { hasText: "Claude Opus 5" }).last().click();
          await page.locator(".model-picker-menu").waitFor();
          await page.getByRole("button", { name: "Antigravity" }).waitFor();        },
      });
    },

    async visual(theme) {
      await shot("visual", theme, {
        regions: { visual: "iframe.markdown-visual" },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: visualMessages }));
        },
        api: visualPage,
        act: waitForVisual,
      });
    },

    async phone(theme) {
      await shot("phone", theme, {
        phone: true,
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: visualMessages }));
        },
        api: visualPage,
        act: waitForVisual,
      });
    },

    async sidebar(theme) {
      await shot("sidebar", theme, {
        phone: true,
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page) => {
          await page.getByText("All 38 tests pass", { exact: false }).waitFor();
          await page.getByRole("button", { name: "Toggle sidebar", exact: true }).click();
          await page.locator(".thread-list").waitFor();
        },
      });
    },

    async sharing(theme) {
      await shot("sharing", theme, {
        regions: { pairing: ".sharing-pairing", devices: ".sharing-pairing ~ .settings-group" },
        api: (route) => {
          const path = new URL(route.request().url()).pathname;
          if (path === "/api/sharing") return sharingState;
          if (path === "/api/sharing/pair") return { url: `http://${sharingState.addresses[0]}/pair#7Qm2xV9cLr`, expiresAt: now + 5 * minute };
        },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page) => {
          await page.locator(".turn").first().waitFor();
          await page.getByRole("button", { name: "Account", exact: true }).click();
          await page.getByRole("button", { name: "Settings", exact: true }).click();
          await page.getByRole("button", { name: "Local sharing", exact: false }).click();
          await page.locator(".sharing-qr svg").waitFor();
        },
      });
    },

    async setup(theme) {
      await shot("setup", theme, {
        snapshot: snapshot({ setupNeeded: true }),
        act: async (page) => {
          await page.getByRole("button", { name: "Get started" }).click();
          await page.getByText("Choose how Citropy looks", { exact: true }).waitFor();
        },
      });
    },

    async usage(theme) {
      await shot("usage", theme, {
        regions: { chart: ".usage-chart" },
        api: (route) => {
          if (new URL(route.request().url()).pathname === "/api/usage") return usageReport;
        },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page) => {
          await page.locator(".turn").first().waitFor();
          await page.getByRole("button", { name: "Account", exact: true }).click();
          await page.getByRole("button", { name: "Usage", exact: true }).click();
          await page.getByRole("button", { name: "Overview", exact: true }).click();
          await page.locator(".usage-chart").waitFor();
        },
      });
    },

    async git(theme) {
      await shot("git", theme, {
        regions: { files: ".git-change-files", commit: ".git-commit-form", review: ".git-review-pane" },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
          if (event.t === "git.refresh") connection.send(JSON.stringify({ t: "git.status", projectId: event.projectId, status: gitStatus }));
          if (event.t === "git.manage" && event.operation === "overview") connection.send(JSON.stringify({ t: "git.manage", requestId: event.requestId, result: gitOverview }));
          if (event.t === "git.diff") connection.send(JSON.stringify({ t: "git.diff", requestId: event.requestId, patch: { ...gitPatch, path: event.path } }));
        },
        act: async (page, connection) => {
          await page.locator(".turn").first().waitFor();
          connection().send(JSON.stringify({ t: "git.status", projectId: "workspace", status: gitStatus }));
          await page.getByRole("button", { name: "Source control", exact: true }).click();
          await page.getByText("feat/rainfall-chart").first().waitFor();
          await page.waitForTimeout(1000);
        },
      });
    },

    async changes(theme) {
      await shot("changes", theme, {
        regions: { panel: ".inspector" },
        preferences: { inspector: "1", inspectorWidth: "460" },
        snapshot: snapshot({ panels: [{ id: "changes", kind: "changes", projectId: "workspace", title: "Changes" }] }),
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
          if (event.t === "git.refresh") connection.send(JSON.stringify({ t: "git.status", projectId: event.projectId, status: gitStatus }));
          if (event.t === "git.diff")
            connection.send(JSON.stringify({ t: "git.diff", requestId: event.requestId, patch: { ...gitPatch, path: event.path } }));
        },
        act: async (page, connection) => {
          await page.locator(".turn").first().waitFor();
          connection().send(JSON.stringify({ t: "panel.upsert", panel: { id: "changes", kind: "changes", projectId: "workspace", title: "Changes" } }));
          connection().send(JSON.stringify({ t: "git.status", projectId: "workspace", status: gitStatus }));
          await page.getByText("RainfallChart.tsx", { exact: true }).waitFor();
          await page.getByText("buckets.ts", { exact: true }).first().click();
          await page.getByText("bucketByHour", { exact: false }).first().waitFor();
        },
      });
    },

    async editor(theme) {
      const panel = { id: "files", kind: "files", projectId: "workspace", title: "Files", threadId: "rainfall" };
      await shot("editor", theme, {
        regions: { panel: ".inspector", code: ".editor-main" },
        preferences: { inspector: "1", panelWidths: JSON.stringify({ inspector: 840 }) },
        snapshot: snapshot({ panels: [panel] }),
        api: (route) => {
          const url = new URL(route.request().url());
          if (url.pathname === "/api/editor/tree") return editorTree[url.searchParams.get("path") ?? ""] ?? [];
          if (url.pathname === "/api/editor/file") return { text: rainfallChartSource, revision: "a".repeat(64) };
        },
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page, connection) => {
          await page.locator(".turn").first().waitFor();
          connection().send(JSON.stringify({ t: "panel.upsert", panel }));
          await page.getByRole("button", { name: "src", exact: true }).click();
          await page.getByRole("button", { name: "dashboard", exact: true }).click();
          await page.getByRole("button", { name: "RainfallChart.tsx", exact: true }).click();
          await page.waitForFunction(() => document.querySelector(".view-lines")?.textContent?.includes("bucketByHour"));
        },
      });
    },

    async browser(theme) {
      await shot("browser", theme, {
        regions: { panel: ".inspector" },
        preferences: { inspector: "1", inspectorWidth: "620" },
        desktop: "browser",
        snapshot: snapshot({
          panels: [{ id: "browser", kind: "browser", projectId: "workspace", title: "Dashboard", threadId: "rainfall" }],
          browsers: [{ id: "browser", projectId: "workspace", threadId: "rainfall", title: "Station dashboard", url: "http://127.0.0.1:8080/dashboard", loading: false, width: 390, height: 844, mobile: true, canGoBack: true, canGoForward: false }],
        }),
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page, connection) => {
          await page.locator(".turn").first().waitFor();
          connection().send(JSON.stringify({ t: "panel.upsert", panel: { id: "browser", kind: "browser", projectId: "workspace", title: "Dashboard", threadId: "rainfall" } }));
          const screen = page.locator(".browser-screen");
          await screen.waitFor();
          const bounds = await screen.boundingBox();
          const cover = await image(dashboardHtml, Math.round(bounds.width), Math.round(bounds.height), 3);
          await page.evaluate((data) => window.__browserCover("browser", data), `data:image/jpeg;base64,${cover}`);
          await page.locator(".browser-cover").waitFor();
          await page.getByText("Phone", { exact: true }).waitFor();
        },
      });
    },

    async question(theme) {
      await shot("question", theme, {
        regions: { panel: ".question-panel" },
        snapshot: snapshot({ threads: [questionThread, ...threads.slice(1)], questions: [questionRequest] }),
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: questionMessages }));
        },
        api: (route) => {
          if (new URL(route.request().url()).pathname === "/api/threads/question") return { ok: true };
        },
        boot: async (page) => {
          const panel = page.getByRole("region", { name: "Your input", exact: true });
          await panel.waitFor();
          await panel.getByText("Keep the time axis continuous with empty hours at zero.", { exact: true }).click();
          await panel.getByRole("radio", { name: /Zero bars/ }).waitFor();
        },
      });
    },

    async workspaces(theme) {
      await shot("workspaces", theme, {
        regions: { menu: ".workspace-menu" },
        desktop: "workspaces",
        snapshot: snapshot({ projects: [project] }),
        onMessage: (event, connection) => {
          if (event.t === "thread.load") connection.send(JSON.stringify({ t: "thread.messages", threadId: event.id, messages: chatMessages }));
        },
        act: async (page) => {
          await page.locator(".turn").first().waitFor();
          await page.getByRole("button", { name: "Add server project", exact: true }).click();
          await page.locator(".workspace-menu").waitFor();
          await page.getByText("citropy-vps", { exact: true }).waitFor();
          await page.getByText("sandbox", { exact: true }).waitFor();
        },
      });
    },
  };

  await mkdir(captures);
  const requested = process.argv.slice(2);
  const names = requested.length ? requested : Object.keys(scenes);
  for (const theme of ["light", "dark"])
    for (const name of names) {
      if (!scenes[name]) throw new Error(`Unknown scene: ${name}`);
      await scenes[name](theme);
      console.log(`${name}-${theme}`);
    }

  if (requested.length) console.log(`Captures kept in ${captures}. Run without scene names to rebuild the README art.`);
  else {
    await composeArt({ browser, origin: server.resolvedUrls.local[0], captures, output: assets, providers });
    await rm(directory, { recursive: true, force: true });
  }
  await browser.close();
  await server.close();
}

await main();
