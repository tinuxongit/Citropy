import assert from "node:assert/strict";
import { test } from "node:test";
import { searchConversations } from "../server/conversation-search.ts";

test("search finds saved message content, scopes workspaces and returns the matching message", () => {
  const threads = [
    { id: "a", projectId: "one", title: "Unrelated title", updatedAt: 1 },
    { id: "b", projectId: "two", title: "Folder task", updatedAt: 2 },
  ];
  const texts = { a: [{ id: "m1", text: "The folder contains random_numbers.txt" }], b: [{ id: "m2", text: "Another FOLDER" }] };
  const search = (query, projectId) => searchConversations(threads, (id) => texts[id], query, projectId);
  assert.deepEqual(search("FOLDER", "one"), [{ threadId: "a", messageId: "m1", snippet: "The folder contains random_numbers.txt" }]);
  assert.deepEqual(search("folder").map((result) => result.threadId), ["b", "a"]);
  assert.equal(search("Unrelated")[0].messageId, undefined);
  assert.deepEqual(search("   "), []);
  assert.deepEqual(search("missing"), []);
});
