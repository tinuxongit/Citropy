import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Cursor writing uses its ACP session with the selected account", async t => {
  const root = await mkdtemp(join(tmpdir(), "citropy-cursor-writing-"));
  const previous = process.env.CITROPY_DATA_DIR;
  process.env.CITROPY_DATA_DIR = join(root, "data");
  const { store } = await import("../server/store.ts");
  const { cursorProvider } = await import("../server/providers/cursor.ts");
  const { generateText } = await import("../server/text-generation.ts");
  const detect = cursorProvider.detect;
  const start = cursorProvider.start;
  let launch;
  let disposed = false;
  cursorProvider.detect = async input => { assert.equal(input.binary, "/custom/cursor"); return { available: true }; };
  cursorProvider.start = options => {
    launch = options;
    return {
      send() {
        queueMicrotask(() => {
          options.emit({ type: "block.start", blockId: "text", block: "text" });
          options.emit({ type: "block.delta", blockId: "text", text: '{"title":"Cursor title","body":""}' });
          options.emit({ type: "turn.end" });
        });
      },
      interrupt() {},
      dispose() { disposed = true; },
    };
  };
  t.after(async () => { cursorProvider.detect = detect; cursorProvider.start = start; if (previous === undefined) delete process.env.CITROPY_DATA_DIR; else process.env.CITROPY_DATA_DIR = previous; await rm(root, { recursive: true, force: true }); });
  const instance = store.saveProviderInstance({ provider: "cursor", name: "Cursor account", binary: "/custom/cursor", environment: { CURSOR_ACCOUNT: "second" } });
  assert.deepEqual(await generateText({ provider: "cursor", model: "cursor-model", providerInstanceId: instance.id }, "Write JSON", []), { title: "Cursor title", body: "" });
  assert.equal(launch.environment.CURSOR_ACCOUNT, "second");
  assert.equal(launch.permissionMode, "plan");
  assert.equal(launch.mcp, undefined);
  assert.equal(disposed, true);
});
