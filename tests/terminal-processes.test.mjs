import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTerminalProcesses, terminalProcesses } from "../server/terminal-processes.ts";

test("process snapshots preserve names and exclude zombie children", () => {
  assert.deepEqual(parseTerminalProcesses(" 10 1 Ss /bin/bash\n 11 10 S+ /usr/bin/sleep\n12 10 Z defunct\n13 10 Sl My Program\ninvalid"), [
    { pid: 10, parent: 1, name: "/bin/bash" },
    { pid: 11, parent: 10, name: "/usr/bin/sleep" },
    { pid: 13, parent: 10, name: "My Program" },
  ]);
  assert.deepEqual(parseTerminalProcesses('{"ProcessId":12,"ParentProcessId":10,"Name":"node.exe"}', true), [{ pid: 12, parent: 10, name: "node.exe" }]);
  assert.deepEqual(parseTerminalProcesses('[null,{"ProcessId":"12"}]', true), []);
  assert.throws(() => parseTerminalProcesses("not JSON", true));
});

test("the native process snapshot contains this process", async () => {
  assert.ok((await terminalProcesses()).some(entry => entry.pid === process.pid));
});
