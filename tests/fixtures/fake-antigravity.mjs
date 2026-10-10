#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";

const tokenPath = join(process.env.GEMINI_HOME, "antigravity-acp", "acp_token.json");
const STATE = "fake-state";
const AUTH_PREFIX = "Open the following link to authenticate the ACP server: ";
const modes = {
  currentModeId: "default",
  availableModes: ["default", "auto_edit", "yolo", "plan"].map(id => ({ id, name: id })),
};
let model = "gemini-pro-agent";
const configOptions = () => [{
  id: "model",
  name: "Model",
  type: "select",
  currentValue: model,
  options: [{ value: "gemini-pro-agent", name: "Gemini Pro (High)" }, { value: "gemini-pro-low", name: "Gemini Pro (Low)" }, { value: "gemini-flash", name: "Gemini Flash", description: "Fast" }],
}];

function signIn() {
  return new Promise((resolve, reject) => {
    const server = createServer(async (request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      if (url.searchParams.get("state") !== STATE || !url.searchParams.get("code")) {
        response.writeHead(400).end();
        return;
      }
      await mkdir(join(process.env.GEMINI_HOME, "antigravity-acp"), { recursive: true });
      await writeFile(tokenPath, "{}");
      response.writeHead(200).end("Signed in");
      server.close();
      resolve();
    });
    server.listen(0, "127.0.0.1", () => {
      const redirect = `http://127.0.0.1:${server.address().port}/`;
      const url = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&state=${STATE}&redirect_uri=${encodeURIComponent(redirect)}`;
      process.stdout.write(`${AUTH_PREFIX}${url}\n`);
      spawn("sh", ["-c", process.env.BROWSER.replace("%s", url)], { stdio: ["ignore", "ignore", "inherit"] }).once("error", reject);
    });
  });
}

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin));
new AgentSideConnection(connection => ({
  initialize: () => ({
    protocolVersion: 1,
    agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} }, auth: { logout: {} }, mcpCapabilities: { http: true } },
    authMethods: [{ id: "oauth-personal", name: "Google" }],
  }),
  authenticate: async () => {
    if (!await stat(tokenPath).catch(() => undefined)) await signIn();
    return {};
  },
  logout: async () => {
    await rm(tokenPath, { force: true });
    return {};
  },
  newSession: () => ({ sessionId: "fake-session", modes, configOptions: configOptions() }),
  resumeSession: () => ({ modes, configOptions: configOptions() }),
  setSessionMode: ({ modeId }) => { modes.currentModeId = modeId; return {}; },
  setSessionConfigOption: ({ value }) => { model = value; return { configOptions: configOptions() }; },
  cancel: () => {},
  prompt: async ({ sessionId, prompt }) => {
    const text = prompt.map(block => block.text ?? "").join("");
    const say = text => connection.sessionUpdate({ sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } });
    if (text.includes("Return only JSON")) {
      await say(JSON.stringify({ title: `Title from ${model} in ${modes.currentModeId}`, body: "Body" }));
      return { stopReason: "end_turn" };
    }
    await say("Listing files");
    await connection.sessionUpdate({ sessionId, update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Run ls", kind: "execute", status: "pending", rawInput: { CommandLine: "ls" } } });
    const permission = await connection.requestPermission({
      sessionId,
      toolCall: { toolCallId: "tool-1" },
      options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Deny", kind: "reject_once" }],
    });
    await connection.sessionUpdate({ sessionId, update: { sessionUpdate: "tool_call_update", toolCallId: "tool-1", status: "completed", rawOutput: { combinedOutput: "a.txt", exitCode: 0 } } });
    await say(`Permission ${permission.outcome.optionId ?? permission.outcome.outcome}`);
    return { stopReason: "end_turn", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
  },
}), stream);
