import { readFile } from "node:fs/promises";
import type { Client, ContentBlock, PromptResponse, RequestPermissionRequest, RequestPermissionResponse, SessionConfigOption, SessionModeState, SessionUpdate, ToolCall, ToolCallUpdate } from "@agentclientprotocol/sdk";
import { askQuestion, cancelQuestions } from "../../questions.ts";
import { ask, cancelThread } from "../../permissions.ts";
import { normalizeTodos } from "../../../shared/todos.ts";
import type { Attachment, PermissionMode, Usage } from "../../../shared/protocol.ts";
import { attachmentNote, isImage } from "../attachments.ts";
import { withSkills } from "../skill-prompt.ts";
import type { AgentSession, SessionConfig, StartOptions } from "../types.ts";
import { isSignInRequired, SIGN_IN_METHOD, SIGN_IN_REQUIRED, startAgent, type Agent } from "./acp.ts";
import { agentModel, currentModel, modelOptions, modelSelector, saveModels } from "./models.ts";
import { modeTarget } from "./modes.ts";
import { antigravityProfile, hasSignIn } from "./profile.ts";
import { describeTool, mergeTool, toolResult, type ToolState } from "./tools.ts";

const QUESTION_PREFIX = "interaction_";
const QUESTION_ID = "answer";
const STOP_REASONS: Record<PromptResponse["stopReason"], string | undefined> = {
  end_turn: undefined,
  cancelled: undefined,
  max_tokens: "Antigravity stopped because its reply reached the length limit.",
  max_turn_requests: "Antigravity stopped because it reached its step limit.",
  refusal: "Antigravity declined to continue.",
};

type Message = { text: string; attachments: Attachment[]; skills: Array<{ name: string; path: string }> };

const live = new Set<AntigravitySession>();

export function stopAccountSessions(instanceId: string | undefined, reason: string): void {
  for (const session of live) if (session.instanceId === instanceId) session.stop(reason);
}

function errorText(error: unknown): string {
  return isSignInRequired(error) ? SIGN_IN_REQUIRED : error instanceof Error ? error.message : String(error);
}

export class AntigravitySession implements AgentSession {
  readonly instanceId: string | undefined;
  #options: StartOptions;
  #agent: Agent | undefined;
  #sessionId = "";
  #ready: Promise<void>;
  #queue: Message[] = [];
  #busy = false;
  #disposed = false;
  #failed = false;
  #turn = 0;
  #segment = 0;
  #blocks = new Set<string>();
  #tools = new Map<string, ToolState>();
  #ended = new Set<string>();
  #modes: SessionModeState | null | undefined;
  #configOptions: SessionConfigOption[] | null | undefined;
  #readOnly = false;
  #totals: Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">;

  get pid(): number | undefined {
    return this.#agent?.child.pid;
  }

  constructor(options: StartOptions) {
    this.#options = options;
    this.instanceId = options.instanceId;
    this.#totals = { input: options.usage?.input ?? 0, output: options.usage?.output ?? 0, cacheRead: options.usage?.cacheRead ?? 0, cacheWrite: options.usage?.cacheWrite ?? 0 };
    live.add(this);
    this.#ready = this.#start();
    void this.#ready.catch(error => this.#fail(errorText(error)));
  }

  async #start(): Promise<void> {
    const options = this.#options;
    const profile = antigravityProfile(this.instanceId);
    if (!await hasSignIn(profile)) throw new Error(SIGN_IN_REQUIRED);
    const agent = await startAgent({
      instanceId: this.instanceId,
      environment: options.environment,
      cwd: options.cwd,
      client: this.#client(),
      onAuthorization: () => this.#fail(SIGN_IN_REQUIRED),
      onFailure: error => this.#fail(error.message),
    });
    this.#agent = agent;
    if (this.#disposed) return agent.stop();
    agent.child.once("close", code => this.#fail(agent.stderr() || `Antigravity exited with code ${code}`));
    await agent.connection.authenticate({ methodId: SIGN_IN_METHOD });
    const capabilities = agent.initialized.agentCapabilities;
    const mcpServers = options.mcp && capabilities?.mcpCapabilities?.http
      ? [{ type: "http" as const, name: "citropy", url: options.mcp.url, headers: Object.entries(options.mcp.headers).map(([name, value]) => ({ name, value })) }]
      : [];
    const resuming = Boolean(options.externalId && capabilities?.sessionCapabilities?.resume);
    const session = resuming
      ? await agent.connection.resumeSession({ sessionId: options.externalId!, cwd: options.cwd, mcpServers })
      : await agent.connection.newSession({ cwd: options.cwd, mcpServers });
    this.#sessionId = resuming ? options.externalId! : (session as { sessionId: string }).sessionId;
    this.#modes = session.modes;
    this.#configOptions = session.configOptions;
    if (modelSelector(this.#configOptions)) await saveModels(profile, modelOptions(this.#configOptions));
    await this.#applyMode(options.permissionMode);
    await this.#applyModel(options.model, options.effort);
    options.emit({ type: "session", externalId: this.#sessionId, ...currentModel(this.#configOptions) });
  }

  #client(): Client {
    return {
      requestPermission: request => this.#permission(request),
      sessionUpdate: async notification => {
        if (notification.sessionId === this.#sessionId && !this.#disposed) this.#update(notification.update);
      },
    };
  }

  async #applyMode(permissionMode: PermissionMode): Promise<void> {
    const target = modeTarget(permissionMode, this.#modes, this.#configOptions);
    const connection = this.#agent!.connection;
    if (target.kind === "option") {
      this.#readOnly = false;
      const response = await connection.setSessionConfigOption({ sessionId: this.#sessionId, configId: target.configId, value: target.value });
      this.#configOptions = response.configOptions;
      return;
    }
    this.#readOnly = target.readOnly;
    if (this.#modes?.currentModeId === target.modeId) return;
    await connection.setSessionMode({ sessionId: this.#sessionId, modeId: target.modeId });
    this.#modes = { ...this.#modes!, currentModeId: target.modeId };
  }

  async #applyModel(model: string | undefined, effort: string | undefined): Promise<void> {
    if (!model || model === "default") return;
    const value = agentModel(this.#configOptions, model, effort);
    const selector = modelSelector(this.#configOptions)!;
    if (selector.currentValue === value) return;
    const response = await this.#agent!.connection.setSessionConfigOption({ sessionId: this.#sessionId, configId: selector.id, value });
    this.#configOptions = response.configOptions;
  }

  async configure(config: SessionConfig): Promise<void> {
    await this.#ready;
    if (config.permissionMode !== undefined) await this.#applyMode(config.permissionMode);
    if (config.model !== undefined) await this.#applyModel(config.model, config.effort);
  }

  send(text: string, attachments: Attachment[] = [], skills: Array<{ name: string; path: string }> = []): void {
    if (this.#disposed || this.#failed) return;
    this.#queue.push({ text, attachments, skills });
    void this.#pump();
  }

  async #prompt(message: Message): Promise<ContentBlock[]> {
    const files = await Promise.all(message.attachments.map(async (file): Promise<ContentBlock> => isImage(file)
      ? { type: "image", mimeType: file.mime!, data: (await readFile(file.path)).toString("base64") }
      : { type: "text", text: attachmentNote(file) }));
    return [{ type: "text", text: withSkills(message.text, message.skills) || "Please inspect the attached files." }, ...files];
  }

  async #pump(): Promise<void> {
    if (this.#busy || this.#disposed || this.#failed) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#busy = true;
    this.#turn++;
    try {
      await this.#ready;
      if (this.#disposed || this.#failed) return;
      this.#options.emit({ type: "status", status: "thinking" });
      const response = await this.#agent!.connection.prompt({ sessionId: this.#sessionId, prompt: await this.#prompt(next) });
      if (response.usage) this.#usage(response.usage);
      this.#finish(STOP_REASONS[response.stopReason]);
    } catch (error) {
      if (!this.#disposed && !this.#failed) this.#finish(errorText(error));
    }
  }

  #usage(usage: NonNullable<PromptResponse["usage"]>): void {
    this.#totals.input += usage.inputTokens;
    this.#totals.output += usage.outputTokens;
    this.#totals.cacheRead += usage.cachedReadTokens ?? 0;
    this.#totals.cacheWrite += usage.cachedWriteTokens ?? 0;
    this.#options.emit({ type: "usage", usage: { ...this.#totals } });
  }

  interrupt(): void {
    if (this.#queue.length) this.#options.emit({ type: "notice", level: "warn", text: this.#queue.length === 1 ? "Stopped before Antigravity started your latest message. Send it again to run it." : `Stopped before Antigravity started your last ${this.#queue.length} messages. Send them again to run them.` });
    this.#queue = [];
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId);
    if (this.#busy && this.#sessionId) void this.#agent!.connection.cancel({ sessionId: this.#sessionId }).catch(error => this.#fail(errorText(error)));
  }

  stop(reason: string): void {
    this.#fail(reason);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    live.delete(this);
    this.#queue = [];
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId);
    this.#agent?.stop();
  }

  #fail(message: string): void {
    if (this.#disposed || this.#failed) return;
    this.#failed = true;
    if (this.#busy) this.#finish(message);
    else this.#options.emit({ type: "notice", level: "error", text: message });
    this.#options.emit({ type: "exit", code: 1 });
    this.dispose();
  }

  #finish(error?: string): void {
    if (!this.#busy) return;
    this.#busy = false;
    this.#closeBlocks();
    this.#tools.clear();
    this.#ended.clear();
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId, { blockingOnly: !error });
    this.#options.emit({ type: "turn.end", ...(error ? { error } : {}) });
    void this.#pump();
  }

  #closeBlocks(): void {
    for (const blockId of this.#blocks) this.#options.emit({ type: "block.end", blockId });
    this.#blocks.clear();
    this.#segment++;
  }

  #text(kind: "text" | "reasoning", text: string): void {
    const blockId = `${this.#turn}:${this.#segment}:${kind}`;
    if (!this.#blocks.has(blockId)) {
      this.#blocks.add(blockId);
      this.#options.emit({ type: "block.start", blockId, block: kind });
    }
    this.#options.emit({ type: "block.delta", blockId, text });
  }

  #update(update: SessionUpdate): void {
    const emit = this.#options.emit;
    switch (update.sessionUpdate) {
      case "agent_message_chunk":
      case "agent_thought_chunk":
        if (update.content.type === "text") this.#text(update.sessionUpdate === "agent_message_chunk" ? "text" : "reasoning", update.content.text);
        return;
      case "tool_call":
      case "tool_call_update":
        this.#tool(update);
        return;
      case "plan":
        emit({ type: "todos", items: normalizeTodos(update.entries) });
        return;
      case "usage_update":
        emit({ type: "usage", usage: { contextTokens: update.used, contextMax: update.size } });
        return;
      case "session_info_update":
        if (update.title?.trim()) emit({ type: "title", title: update.title.trim() });
        return;
      case "current_mode_update":
        if (this.#modes) this.#modes = { ...this.#modes, currentModeId: update.currentModeId };
        return;
      case "config_option_update":
        this.#configOptions = update.configOptions;
        return;
    }
  }

  #track(update: ToolCall | ToolCallUpdate): { tool: ToolState; started: boolean } {
    const previous = this.#tools.get(update.toolCallId);
    const tool = mergeTool(previous, update);
    this.#tools.set(update.toolCallId, tool);
    return { tool, started: Boolean(previous) };
  }

  #tool(update: ToolCall | ToolCallUpdate): void {
    if (update.toolCallId.startsWith(QUESTION_PREFIX)) return;
    const { tool, started } = this.#track(update);
    const emit = this.#options.emit;
    const { name, input } = describeTool(tool);
    if (!started) {
      this.#closeBlocks();
      emit({ type: "tool.start", callId: tool.toolCallId, name, input });
    } else emit({ type: "tool.input", callId: tool.toolCallId, name, input });
    if ((tool.status === "completed" || tool.status === "failed") && !this.#ended.has(tool.toolCallId)) {
      this.#ended.add(tool.toolCallId);
      const result = toolResult(tool);
      emit({ type: "tool.end", callId: tool.toolCallId, ok: result.ok, output: result.text, ...(result.images.length ? { images: result.images } : {}) });
    } else if (tool.status !== "completed" && tool.status !== "failed") emit({ type: "status", status: "working", tool: name });
  }

  async #permission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    const { tool } = this.#track(request.toolCall);
    const options = request.options;
    const choose = (kinds: string[]): RequestPermissionResponse => {
      const option = kinds.map(kind => options.find(entry => entry.kind === kind)).find(Boolean);
      return { outcome: option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" } };
    };
    if (tool.toolCallId.startsWith(QUESTION_PREFIX)) {
      const result = await askQuestion(this.#options.threadId, [{ id: QUESTION_ID, question: tool.title || "Antigravity has a question.", options: options.map(option => ({ label: option.name })), multiple: false }]);
      const option = options.find(entry => entry.name === result.answers[QUESTION_ID]?.[0]);
      return { outcome: !result.cancelled && option ? { outcome: "selected", optionId: option.optionId } : { outcome: "cancelled" } };
    }
    if (this.#readOnly) return choose(["reject_once", "reject_always"]);
    const { name, input } = describeTool(tool);
    this.#options.emit({ type: "status", status: "awaiting" });
    const decision = await ask(this.#options.threadId, name, input);
    if (!this.#disposed) this.#options.emit({ type: "status", status: "working" });
    return choose(decision === "deny" ? ["reject_once", "reject_always"] : ["allow_once"]);
  }
}
