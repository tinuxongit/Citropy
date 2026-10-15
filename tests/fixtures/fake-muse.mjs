#!/usr/bin/env node
import { createInterface } from "node:readline";

const readOnly = process.argv.includes("--disable-write");
const sessions = new Map();
const approvals = new Map();
const usage = { observedAtMs: 1_000, tier: "Pro", window: { usedPercent: 25, resetsAtMs: 2_000, windowDurationMins: 300 }, weekly: { usedPercent: 60, resetsAtMs: 3_000 } };
const skills = [{ selector: "review", displayName: "Review", description: "Review the changes", argumentHint: "[focus]" }];
const models = [
  { providerId: "meta", modelId: "muse-large", displayLabel: "Muse Large", isDefault: true, variants: ["low", "high"], defaultReasoningEffort: "high", contextLimit: 200_000 },
  { providerId: "meta", modelId: "muse-small", displayLabel: "Muse Small", description: "Fast" },
  { providerId: "other", modelId: "elsewhere", displayLabel: "Elsewhere" },
];
let nextRequest = 0;
let revision = 0;

function send(frame) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...frame })}\n`);
}

function notify(method, params) {
  send({ method, params });
}

function request(method, params) {
  const id = ++nextRequest;
  send({ id, method, params });
  return id;
}

function item(sessionId, fields) {
  notify(fields.status === "inProgress" ? "item/started" : "item/completed", { sessionId, item: { revision: ++revision, ...fields } });
}

function text(input) {
  return input.filter(part => part.type === "text").map(part => part.text).join("\n");
}

function reply(sessionId, turnId, itemId, message) {
  item(sessionId, { itemId, kind: "agentMessage", status: "inProgress", text: "" });
  notify("item/delta", { sessionId, itemId, delta: message });
  item(sessionId, { itemId, kind: "agentMessage", status: "completed", text: message });
  notify("session/tokenUsage", { sessionId, turnId, promptTokens: 12, usage: { inputTokens: 12, outputTokens: 5, cacheReadTokens: 2, cachedTokens: 2, reasoningTokens: 0 } });
  notify("turn/completed", { sessionId, turnId, terminal: "completed" });
}

function approve(sessionId, turnId, command, stages, finish) {
  const approval = {
    sessionId,
    turnId,
    approvalId: `${turnId}-approval`,
    toolName: "shell",
    rawArgs: JSON.stringify({ command }),
    subject: { kind: "shell", command },
    availableChoices: [
      { choiceId: "deny", decision: "denied", label: "Deny", scope: "once" },
      { choiceId: "session", decision: "approvedForSession", label: "Allow for session", scope: "session" },
      { choiceId: "once", decision: "approved", label: "Allow", scope: "once" },
    ],
    stage: 0,
    stages,
    choices: [],
    finish,
  };
  approvals.set(approval.approvalId, approval);
  return approval;
}

function ask({ stage, stages, choices, finish, ...approval }) {
  request("approval/request", { ...approval, currentRequirementId: { approvalId: approval.approvalId, sourceIndex: stage } });
}

function decide(params) {
  const approval = approvals.get(params.approvalId);
  if (!approval) throw { code: -32050, message: "Already resolved", data: { kind: "approvalAlreadyResolved" } };
  if (params.requirementId.sourceIndex !== approval.stage) throw { code: -32053, message: "Stale requirement", data: { kind: "approvalRequirementStale" } };
  approval.choices.push(params.choiceId);
  const terminal = ++approval.stage === approval.stages;
  setImmediate(() => {
    if (!terminal) return ask(approval);
    approvals.delete(approval.approvalId);
    notify("approval/resolved", { sessionId: approval.sessionId, turnId: approval.turnId, approvalId: approval.approvalId, decision: "approved", resolvedBy: "user" });
    approval.finish(approval.choices);
  });
  return { commandId: params.commandId, approvalId: approval.approvalId, status: "accepted", terminal };
}

function turn(sessionId, turnId, input) {
  notify("turn/started", { sessionId, turnId });
  const skill = input.find(part => part.type === "skill");
  if (skill) return reply(sessionId, turnId, `${turnId}-reply`, `Skill ${skill.selector} ${skill.arguments ?? ""}`.trim());
  const prompt = text(input);
  if (sessions.get(sessionId).approvalMode === "denyUnmatched") return reply(sessionId, turnId, `${turnId}-reply`, JSON.stringify({ title: `Title from ${sessions.get(sessionId).modelId}`, body: "Body" }));
  if (prompt.includes("List")) {
    const command = "ls | wc -l";
    const approval = approve(sessionId, turnId, command, 2, choices => {
      item(sessionId, { itemId: "tool-1", kind: "toolCall", tool: "shell", status: "inProgress", args: JSON.stringify({ command }) });
      notify("item/delta", { sessionId, itemId: "tool-1", field: "output", delta: "a.txt" });
      item(sessionId, { itemId: "tool-1", kind: "toolCall", tool: "shell", status: "completed", args: JSON.stringify({ command }), exitCode: 0, visibleOutput: "a.txt" });
      reply(sessionId, turnId, `${turnId}-reply`, `Listed after ${choices.join(", ")}`);
    });
    return ask(approval);
  }
  if (prompt.includes("Remove")) {
    const approval = approve(sessionId, turnId, "rm a.txt", 1, () => {});
    sessions.get(sessionId).steer = () => {
      approvals.delete(approval.approvalId);
      notify("approval/resolved", { sessionId, turnId, approvalId: approval.approvalId, decision: "approved", resolvedBy: "policy" });
      reply(sessionId, turnId, `${turnId}-reply`, "Removed by policy");
    };
    return ask(approval);
  }
  if (prompt.includes("background")) {
    const args = JSON.stringify({ command: "npm run dev" });
    sessions.get(sessionId).background = () => {
      item(sessionId, { itemId: "shell-1", kind: "toolCall", tool: "shell", status: "cancelled", args, background: true, visibleOutput: "ready" });
    };
    item(sessionId, { itemId: "shell-1", kind: "toolCall", tool: "shell", status: "inProgress", args, background: true });
    notify("item/delta", { sessionId, itemId: "shell-1", field: "output", delta: "ready" });
    return reply(sessionId, turnId, `${turnId}-reply`, "Started");
  }
  notify("usage/changed", { ...usage, observedAtMs: 5_000, window: { ...usage.window, usedPercent: 40 } });
  if (prompt.includes("limit")) return notify("turn/completed", { sessionId, turnId, terminal: "failed", error: { message: "limit", quota: { limitKind: "window", resetsAtMs: Date.now() + 120_000 } } });
  reply(sessionId, turnId, `${turnId}-reply`, `Echo ${prompt}`);
}

const handlers = {
  initialize: params => ({
    schema: { version: 1, fingerprint: "fake" },
    grantedCapabilities: readOnly ? [] : params.capabilities.requestedCapabilities,
    serverInfo: { name: "fake-muse", version: "1.4.6" },
  }),
  "session/start": params => {
    sessions.set(params.sessionId, { approvalMode: params.approvalMode, modelId: params.modelId ?? "muse-large" });
    return { session: { sessionId: params.sessionId, modelId: params.modelId ?? "muse-large", title: "Fake session" } };
  },
  "session/resume": params => {
    sessions.set(params.sessionId, { approvalMode: "promptUnmatched", modelId: "muse-large" });
    return { session: { sessionId: params.sessionId, modelId: "muse-large" } };
  },
  "session/setApprovalMode": params => {
    sessions.get(params.sessionId).approvalMode = params.mode;
    return { commandId: params.commandId };
  },
  "session/setModel": params => {
    sessions.get(params.sessionId).modelId = params.model.modelId;
    return { commandId: params.commandId };
  },
  "turn/start": params => {
    setImmediate(() => turn(params.sessionId, params.commandId, params.input));
    return { commandId: params.commandId, turnId: params.commandId, startedNewTurn: true, disposition: "started", status: "accepted" };
  },
  "turn/steer": params => {
    setImmediate(() => sessions.get(params.sessionId).steer());
    return { commandId: params.commandId };
  },
  "approval/decide": decide,
  "task/stop": params => {
    setImmediate(() => sessions.get(params.sessionId).background());
    return { commandId: params.commandId };
  },
  "model/list": () => ({ models }),
  "skill/list": () => ({ skills }),
  "usage/read": () => ({ usage }),
};

createInterface({ input: process.stdin }).on("line", line => {
  const message = JSON.parse(line);
  if (message.id === undefined || message.method === undefined) return;
  const handler = handlers[message.method];
  if (!handler) return send({ id: message.id, error: { code: -32601, message: `Unknown method ${message.method}`, data: { kind: "methodNotFound" } } });
  try {
    send({ id: message.id, result: handler(message.params ?? {}) });
  } catch (error) {
    send({ id: message.id, error });
  }
});
