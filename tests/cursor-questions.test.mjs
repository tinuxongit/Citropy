import "./fixtures/isolated-data.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { askCursorQuestion } from "../server/providers/acp-cursor.ts";
import { answerQuestion, pendingQuestions } from "../server/questions.ts";
import { store } from "../server/store.ts";

function fixture(t) {
  const project = [...store.projects.values()].find(project => project.chat);
  const thread = store.createThread({ projectId: project.id, provider: "cursor", title: "Cursor question test" });
  store.patchThread(thread.id, { running: true });
  t.after(() => store.removeThread(thread.id));
  return thread;
}

const question = { id: "storage", prompt: "Choose storage", options: [{ id: "pg", label: "Postgres" }, { id: "mysql", label: "MySQL" }], allowMultiple: true };

test("Cursor questions retain selected option IDs", async t => {
  const thread = fixture(t);
  const response = askCursorQuestion(thread.id, { questions: [question] }, new AbortController().signal);
  const request = pendingQuestions().find(request => request.threadId === thread.id);
  answerQuestion(thread.id, request.id, { storage: ["Postgres", "MySQL"] });
  assert.deepEqual(await response, { outcome: { outcome: "answered", answers: [{ questionId: "storage", selectedOptionIds: ["pg", "mysql"] }] } });
});

test("Cursor receives custom answers and accompanying choices through its supported reason field", async t => {
  const thread = fixture(t);
  const response = askCursorQuestion(thread.id, { questions: [question] }, new AbortController().signal);
  const request = pendingQuestions().find(request => request.threadId === thread.id);
  answerQuestion(thread.id, request.id, { storage: ["Postgres", "Use SQLite instead"] });
  const result = await response;
  assert.equal(result.outcome.outcome, "skipped");
  assert.ok(result.outcome.reason.includes("Choose storage"));
  assert.ok(result.outcome.reason.includes("Postgres"));
  assert.ok(result.outcome.reason.includes("Use SQLite instead"));
});

test("Cursor questions without options allow custom answers without inventing an OK choice", async t => {
  const thread = fixture(t);
  const response = askCursorQuestion(thread.id, { questions: [{ ...question, options: [] }] }, new AbortController().signal);
  const request = pendingQuestions().find(request => request.threadId === thread.id);
  assert.deepEqual(request.questions[0].options, []);
  answerQuestion(thread.id, request.id, { storage: ["SQLite"] });
  const result = await response;
  assert.equal(result.outcome.outcome, "skipped");
  assert.ok(result.outcome.reason.includes("SQLite"));
});

test("cancelled Cursor questions remain cancelled", async t => {
  const thread = fixture(t);
  const controller = new AbortController();
  const response = askCursorQuestion(thread.id, { questions: [question] }, controller.signal);
  controller.abort();
  assert.deepEqual(await response, { outcome: { outcome: "cancelled" } });
});
