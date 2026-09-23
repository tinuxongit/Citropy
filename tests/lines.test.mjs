import assert from "node:assert/strict";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import { onJson } from "../server/lines.ts";

test("JSON parsing preserves chunked records and routes plain output separately", () => {
  const stream = new PassThrough();
  const values = [];
  const text = [];
  onJson(stream, value => values.push(value), line => text.push(line));
  stream.write('  {"value":');
  stream.write('1}\r\nplain output\n{broken json}\n[1,2]\n');
  assert.deepEqual(values, [{ value: 1 }, [1, 2]]);
  assert.deepEqual(text, ["plain output", "{broken json}"]);
  stream.end();
});

test("handler failures retain the actual error without dumping a private wire event", () => {
  const stream = new PassThrough();
  const text = [];
  const errors = [];
  const failure = new Error("database is locked");
  onJson(stream, () => { throw failure; }, line => text.push(line), error => errors.push(error));
  stream.write(`${JSON.stringify({ method: "item/started", params: { item: { type: "commandExecution", command: "private command" } } })}\n`);
  assert.deepEqual(errors, [failure]);
  assert.deepEqual(text, []);
  stream.end();
});
