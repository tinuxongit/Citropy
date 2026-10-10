import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { arts } from "./compositions.mjs";

const SETTLE_MS = 300;

async function readShots(captures) {
  const shots = {};
  for (const file of (await readdir(captures)).filter((name) => name.endsWith(".json"))) {
    const key = basename(file, ".json");
    shots[key] = { src: `/capture/${key}.png`, ...JSON.parse(await readFile(join(captures, file), "utf8")) };
  }
  return shots;
}

export async function composeArt({ browser, origin, captures, output, providers }) {
  const context = { shots: await readShots(captures), providers };
  for (const art of arts) {
    const page = await browser.newPage({ viewport: { width: art.width, height: art.height }, deviceScaleFactor: art.scale });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/capture/**", (route) => route.fulfill({ path: join(captures, basename(new URL(route.request().url()).pathname)) }));
    await page.goto(new URL("/tests/readme-art/stage.html", origin).href);
    await page.waitForFunction(() => typeof window.paintArt === "function");
    await page.evaluate((html) => window.paintArt(html), art.html(context));
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(output, `${art.name}.png`), omitBackground: !art.opaque });
    if (errors.length) throw new Error(`${art.name}: ${errors.join(" | ")}`);
    await page.close();
    console.log(art.name);
  }
}
