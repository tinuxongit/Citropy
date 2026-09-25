import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import childProcess from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { syncBuiltinESMExports } from "node:module";

test("Claude changes model and permission mode without replacing its session", async t => {
  const originalSpawn = childProcess.spawn;
  let child;
  childProcess.spawn = () => {
    child = new EventEmitter();
    child.stdin = new PassThrough();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.requests = [];
    child.stdin.on("data", data => {
      const request = JSON.parse(String(data));
      child.requests.push(request);
      if (request.type === "control_request") child.stdout.write(`${JSON.stringify({ type: "control_response", response: { request_id: request.request_id, subtype: "success" } })}\n`);
    });
    child.kill = () => true;
    return child;
  };
  syncBuiltinESMExports();
  t.after(() => { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); });
  const { claudeProvider } = await import("../server/providers/claude.ts");
  const session = claudeProvider.start({ threadId: "fixture", cwd: process.cwd(), model: "sonnet", permissionMode: "manual", emit: () => {} });
  t.after(() => session.dispose());
  await session.configure({ model: "opus", permissionMode: "plan", contextMax: 200_000, fastMode: false });
  assert.deepEqual(child.requests.map(request => request.request), [{ subtype: "set_model", model: "opus" }, { subtype: "set_permission_mode", mode: "plan" }]);
  await session.configure({ model: "opus", permissionMode: "plan" });
  assert.equal(child.requests.length, 2);
  await assert.rejects(session.configure({ effort: "high" }), /restart/);
  assert.equal(child.requests.length, 2);
});
