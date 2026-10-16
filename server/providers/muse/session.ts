import { readFile } from "node:fs/promises";
import { MspError } from "@muse-code/sdk";
import type {
  ApprovalRequestParams,
  ApprovalUpdatedParams,
  Item,
  ItemDeltaParams,
  Session,
  SessionCompactResult,
  SessionContextUsageParams,
  SessionResumeResult,
  SessionStartResult,
  SessionTokenUsageParams,
  SubscriptionUsage,
  TurnCompletedParams,
  TurnInputPart,
  TurnRetryScheduledParams,
  TurnStartResult,
  UserInputRequestParams,
} from "@muse-code/sdk/dist/src/msp.js";
import { ask, cancelThread } from "../../permissions.ts";
import { askQuestion, cancelQuestions } from "../../questions.ts";
import { normalizeTodos } from "../../../shared/todos.ts";
import type { Attachment, PermissionMode, ThreadStatus, Usage } from "../../../shared/protocol.ts";
import { attachmentNote, isImage } from "../attachments.ts";
import { withSkills } from "../skill-prompt.ts";
import type { AgentSession, SessionConfig, StartOptions } from "../types.ts";
import { APPROVAL_MODES, approvalChoice, approvalTool, autoApproved, SETTLED_ELSEWHERE } from "./approvals.ts";
import { hostAccess, MUSE_PROVIDER, MuseHost, unreadable, type HostAccess } from "./host.ts";
import { quotaMessage, recordMuseUsage } from "./limits.ts";
import { museAnswers, userQuestions } from "./questions.ts";
import { listSkills, skillPart } from "./skills.ts";
import { hasNativeRow, itemOk, itemOutput, museTool } from "./tools.ts";

const MCP_SERVER = "citropy";
const EMPTY_PROMPT = "Please inspect the attached files.";
const QUESTION_DISMISSED = "The user dismissed the question.";
const HIDDEN_ITEMS = new Set(["userMessage", "reminderChild", "hookRun", "sideChat"]);
const TOOL_ITEMS = new Set(["toolCall", "userShell", "workflow", "webSearch"]);
const BACKGROUND_ITEMS = new Set(["subagent", "workflow"]);
const OUTPUT_FIELDS = new Set(["output", "visibleOutput"]);
const SUMMARY_FIELD = /^summary\.(\d+)$/;
const REASONING_SEPARATOR = "\n\n";

type Message = { text: string; attachments: Attachment[]; skills: Array<{ name: string; path: string }> };
type Totals = Pick<Usage, "input" | "output" | "cacheRead" | "cacheWrite">;
type PendingApproval = { params: ApprovalRequestParams; prompt: AbortController };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function childStatus(item: Item): ThreadStatus {
  if (item.status === "inProgress") return "working";
  if (item.status === "cancelled") return "stopped";
  return item.status === "completed" && !item.failureKind ? "idle" : "error";
}

function reasoningText(item: Item): string {
  return item.summary?.length ? item.summary.join(REASONING_SEPARATOR) : item.text ?? "";
}

export class MuseSession implements AgentSession {
  #options: StartOptions;
  #access: HostAccess;
  #permissionMode: PermissionMode;
  #model: string | undefined;
  #effort: string | undefined;
  #host: MuseHost | undefined;
  #sessionId = "";
  #ready: Promise<void>;
  #queue: Message[] = [];
  #busy = false;
  #compacting = false;
  #acked = false;
  #interruptPending = false;
  #disposed = false;
  #failed = false;
  #turns = new Set<string>();
  #settledTurns = new Set<string>();
  #turnError: string | undefined;
  #items = new Map<string, Item>();
  #blocks = new Map<string, string>();
  #tools = new Set<string>();
  #ended = new Set<string>();
  #approvals = new Map<string, PendingApproval>();
  #questions = new Map<string, AbortController>();
  #background = new Set<string>();
  #skills = new Set<string>();
  #totals: Totals;

  constructor(options: StartOptions) {
    this.#options = options;
    this.#access = hostAccess(options.permissionMode, options.readOnly);
    this.#permissionMode = options.permissionMode;
    this.#model = options.model && options.model !== "default" ? options.model : undefined;
    this.#effort = options.effort;
    this.#totals = { input: options.usage?.input ?? 0, output: options.usage?.output ?? 0, cacheRead: options.usage?.cacheRead ?? 0, cacheWrite: options.usage?.cacheWrite ?? 0 };
    this.#ready = this.#start();
    void this.#ready.catch(error => this.#fail(errorText(error)));
  }

  async #start(): Promise<void> {
    const options = this.#options;
    const host = await MuseHost.start({ launch: options, cwd: options.cwd, access: this.#access });
    this.#host = host;
    if (this.#disposed) return host.close();
    host.connection.onNotification(notification => {
      if (this.#disposed) return;
      if (notification.method === "usage/changed") return recordMuseUsage(options.instanceId, notification.params as unknown as SubscriptionUsage);
      try {
        this.#notification(notification.method, (notification.params ?? {}) as Record<string, unknown>);
      } catch (error) {
        this.#fail(errorText(error));
      }
    });
    host.connection.onProtocolError(error => this.#fail(unreadable(error)));
    host.connection.onServerRequest(async request => {
      if (request.method === "approval/request") this.#approval(request.params as unknown as ApprovalRequestParams);
      else if (request.method === "userInput/request") this.#userInput(request.params as unknown as UserInputRequestParams);
      else throw new Error(`Citropy does not handle the Muse Code request ${request.method}.`);
      return {};
    });
    void host.exited.then(exit => this.#fail(host.stderr() || `Muse Code exited with ${exit.signal ?? `code ${exit.code}`}.`));
    const config = options.mcp && host.mcp
      ? { mcpServers: { [MCP_SERVER]: { transport: "streamableHttp", mode: "optional", url: options.mcp.url, headers: options.mcp.headers } } }
      : undefined;
    const approvalMode = APPROVAL_MODES[this.#permissionMode];
    let session: Session;
    if (options.externalId) {
      this.#sessionId = options.externalId;
      session = (await host.command<SessionResumeResult>("session/resume", { sessionId: this.#sessionId, excludeItems: true, ...(config ? { config } : {}) })).session;
      await host.command("session/setApprovalMode", { sessionId: this.#sessionId, mode: approvalMode });
      if (this.#model && this.#model !== session.modelId) await this.#setModel(this.#model);
    } else {
      this.#sessionId = host.connection.mintCommandId();
      session = (await host.command<SessionStartResult>("session/start", {
        sessionId: this.#sessionId,
        workspaceRoot: options.cwd,
        providerId: MUSE_PROVIDER,
        approvalMode,
        ...(this.#model ? { modelId: this.#model } : {}),
        ...(config ? { config } : {}),
      })).session;
    }
    const model = this.#model ?? session.modelId ?? undefined;
    options.emit({ type: "session", externalId: this.#sessionId, ...(model ? { model } : {}), ...(this.#effort ? { effort: this.#effort } : {}) });
    if (session.title?.trim()) options.emit({ type: "title", title: session.title.trim() });
    await this.#refreshSkills();
  }

  async #refreshSkills(): Promise<void> {
    this.#skills = new Set((await listSkills(this.#host!, this.#sessionId)).map(skill => skill.selector));
  }

  async #setModel(model: string): Promise<void> {
    await this.#host!.command("session/setModel", { sessionId: this.#sessionId, model: { modelId: model, providerId: MUSE_PROVIDER } });
    this.#model = model;
  }

  async configure(config: SessionConfig): Promise<void> {
    await this.#ready;
    if (config.permissionMode !== undefined && config.permissionMode !== this.#permissionMode) {
      if (hostAccess(config.permissionMode, this.#options.readOnly) !== this.#access) throw new Error("Muse Code restarts to change what it may access.");
      await this.#host!.command("session/setApprovalMode", { sessionId: this.#sessionId, mode: APPROVAL_MODES[config.permissionMode] });
      this.#permissionMode = config.permissionMode;
    }
    if (config.model !== undefined && config.model !== "default" && config.model !== this.#model) await this.#setModel(config.model);
    if (config.effort !== undefined) this.#effort = config.effort;
  }

  send(text: string, attachments: Attachment[] = [], skills: Array<{ name: string; path: string }> = []): void {
    if (this.#disposed || this.#failed) return;
    this.#queue.push({ text, attachments, skills });
    void this.#pump();
  }

  async steer(text: string, attachments: Attachment[] = [], skills: Array<{ name: string; path: string }> = []): Promise<void> {
    await this.#ready;
    const turnId = [...this.#turns][0];
    if (!this.#busy || this.#compacting || !this.#acked || !turnId) throw new Error("Muse Code is still starting this turn. Try again in a moment.");
    await this.#host!.command("turn/steer", {
      sessionId: this.#sessionId,
      expectedTurnId: turnId,
      input: await this.#input({ text, attachments, skills }),
      ...(this.#effort ? { reasoningEffort: this.#effort } : {}),
    });
  }

  async compact(): Promise<void> {
    await this.#ready;
    if (this.#busy) throw new Error("Muse Code is still working.");
    this.#busy = true;
    this.#compacting = true;
    let result: SessionCompactResult;
    try {
      result = await this.#host!.command<SessionCompactResult>("session/compact", { sessionId: this.#sessionId });
    } catch (error) {
      this.#busy = false;
      this.#compacting = false;
      throw error;
    }
    this.#acked = true;
    if (result.status !== "noop") return;
    this.#compacting = false;
    this.#options.emit({ type: "notice", level: "warn", text: "Muse Code found nothing to compact yet." });
    this.#finish();
  }

  async #input(message: Message): Promise<TurnInputPart[]> {
    const files = await Promise.all(message.attachments.map(async (file): Promise<TurnInputPart> => isImage(file)
      ? { type: "image", base64Data: (await readFile(file.path)).toString("base64"), mediaType: file.mime! }
      : { type: "text", text: attachmentNote(file) }));
    const skill = skillPart(message.text, this.#skills);
    const instructions = withSkills(skill ? "" : message.text, message.skills);
    const text: TurnInputPart[] = skill && !instructions ? [] : [{ type: "text", text: instructions || EMPTY_PROMPT }];
    return [...skill ? [skill] : [], ...text, ...files];
  }

  async #pump(): Promise<void> {
    if (this.#busy || this.#disposed || this.#failed) return;
    const next = this.#queue.shift();
    if (!next) return;
    this.#busy = true;
    try {
      await this.#ready;
      if (this.#disposed || this.#failed) return;
      this.#options.emit({ type: "status", status: "thinking" });
      const host = this.#host!;
      const turnId = host.connection.mintCommandId();
      this.#turns.add(turnId);
      const result = await host.command<TurnStartResult>("turn/start", {
        sessionId: this.#sessionId,
        input: await this.#input(next),
        displayText: next.text,
        workspaceRoots: [this.#options.cwd],
        ifBusy: "queue",
        ...(this.#effort ? { reasoningEffort: this.#effort } : {}),
      }, { commandId: turnId, retry: true });
      if (!this.#busy) return;
      if (result.turnId !== turnId) {
        this.#turns.delete(turnId);
        if (!this.#settledTurns.has(result.turnId)) this.#turns.add(result.turnId);
      }
      this.#acked = true;
      if (!this.#turns.size) this.#finish(this.#turnError);
      else if (this.#interruptPending) this.interrupt();
    } catch (error) {
      if (!this.#disposed && !this.#failed) this.#finish(errorText(error));
    }
  }

  interrupt(): void {
    if (this.#queue.length) this.#options.emit({ type: "notice", level: "warn", text: this.#queue.length === 1 ? "Stopped before Muse Code started your latest message. Send it again to run it." : `Stopped before Muse Code started your last ${this.#queue.length} messages. Send them again to run them.` });
    this.#queue = [];
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId);
    if (!this.#busy) return;
    if (!this.#acked) {
      this.#interruptPending = true;
      return;
    }
    this.#interruptPending = false;
    const turnIds = this.#compacting ? [undefined] : [...this.#turns];
    for (const turnId of turnIds) {
      void this.#host!.command("turn/interrupt", { sessionId: this.#sessionId, ...(turnId ? { turnId } : {}) }).catch(error => this.#fail(errorText(error)));
    }
  }

  async stopShell(taskId: string): Promise<void> {
    await this.#ready;
    if (!this.#background.has(taskId)) return;
    await this.#host!.command("task/stop", { sessionId: this.#sessionId, taskId });
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#queue = [];
    this.#approvals.clear();
    this.#questions.clear();
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId);
    void this.#host?.close();
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
    const compacting = this.#compacting;
    this.#busy = false;
    this.#compacting = false;
    this.#acked = false;
    this.#interruptPending = false;
    this.#turns.clear();
    this.#turnError = undefined;
    for (const blockId of this.#blocks.keys()) this.#options.emit({ type: "block.end", blockId });
    this.#blocks.clear();
    this.#tools.clear();
    this.#ended.clear();
    for (const [id, item] of this.#items) if (!BACKGROUND_ITEMS.has(item.kind) && !this.#background.has(id)) this.#items.delete(id);
    this.#approvals.clear();
    this.#questions.clear();
    cancelThread(this.#options.threadId, false);
    cancelQuestions(this.#options.threadId, { blockingOnly: !error });
    if (compacting && !error) this.#options.emit({ type: "compacted" });
    else this.#options.emit({ type: "turn.end", ...(error ? { error } : {}) });
    void this.#pump();
  }

  #notification(method: string, params: Record<string, unknown>): void {
    if (params.sessionId !== this.#sessionId) return;
    const emit = this.#options.emit;
    switch (method) {
      case "item/started":
      case "item/updated":
      case "item/completed":
        this.#item(params.item as Item);
        return;
      case "item/delta":
        this.#delta(params as unknown as ItemDeltaParams);
        return;
      case "turn/started":
        this.#turnStarted(String(params.turnId));
        return;
      case "turn/completed":
        this.#turnCompleted(params as unknown as TurnCompletedParams);
        return;
      case "turn/retryScheduled": {
        const retry = params as unknown as TurnRetryScheduledParams;
        emit({ type: "notice", level: "warn", text: `Muse Code is retrying, attempt ${retry.nextAttempt} of ${retry.maxAttempts}. ${retry.reason}` });
        return;
      }
      case "approval/requested":
        this.#approval(params as unknown as ApprovalRequestParams);
        return;
      case "approval/updated":
        if (this.#approvals.has(String(params.approvalId))) this.#approval(params as unknown as ApprovalUpdatedParams);
        return;
      case "approval/resolved":
        this.#resolved(String(params.approvalId));
        return;
      case "userInput/requested":
        this.#userInput(params as unknown as UserInputRequestParams);
        return;
      case "userInput/settled":
        this.#questions.get(String(params.userInputId))?.abort();
        this.#questions.delete(String(params.userInputId));
        return;
      case "session/tokenUsage":
        this.#usage(params as unknown as SessionTokenUsageParams);
        return;
      case "session/contextUsage": {
        const context = params as unknown as SessionContextUsageParams;
        emit({ type: "usage", usage: { contextTokens: context.usedTokens, ...(context.windowTokens ? { contextMax: context.windowTokens } : {}) } });
        return;
      }
      case "session/todoListChanged":
        emit({ type: "todos", items: normalizeTodos(params.items) });
        return;
      case "session/nameChanged":
        if (typeof params.name === "string" && params.name.trim()) emit({ type: "title", title: params.name.trim() });
        return;
      case "skill/changed":
        void this.#refreshSkills().catch(error => this.#fail(errorText(error)));
        return;
      case "session/modelRouteUnserved":
        emit({ type: "notice", level: "warn", text: `Muse Code could not use the model ${String(params.modelId)}.` });
        return;
      case "view/gap":
        this.#fail("Muse Code missed some updates for this conversation. Send your message again to reload it.");
        return;
    }
  }

  #turnStarted(turnId: string): void {
    if (this.#compacting || this.#turns.has(turnId)) return;
    this.#turns.add(turnId);
    if (this.#busy) return;
    this.#busy = true;
    this.#acked = true;
    this.#options.emit({ type: "status", status: "thinking" });
  }

  #turnCompleted(params: TurnCompletedParams): void {
    if (this.#compacting) return;
    this.#settledTurns.add(params.turnId);
    if (!this.#turns.delete(params.turnId)) return;
    if (params.terminal === "failed") this.#turnError = params.error?.quota ? quotaMessage(params.error.quota) : params.error?.message ?? params.reason ?? "Muse Code could not finish this turn.";
    if (!this.#turns.size && this.#acked) this.#finish(this.#turnError);
  }

  #usage(params: SessionTokenUsageParams): void {
    const cacheRead = params.usage.cacheReadTokens ?? 0;
    const cacheWrite = params.usage.cacheWriteTokens ?? 0;
    this.#totals.input += Math.max(0, params.promptTokens - cacheRead - cacheWrite);
    this.#totals.output += params.usage.outputTokens;
    this.#totals.cacheRead += cacheRead;
    this.#totals.cacheWrite += cacheWrite;
    this.#options.emit({ type: "usage", usage: { ...this.#totals } });
  }

  #item(incoming: Item): void {
    if (HIDDEN_ITEMS.has(incoming.kind) || hasNativeRow(incoming)) return;
    const previous = this.#items.get(incoming.itemId);
    if (previous && incoming.revision <= previous.revision) return;
    const item: Item = { ...incoming, ...(incoming.summary ? { summary: [...incoming.summary] } : {}) };
    this.#items.set(item.itemId, item);
    if (item.kind === "subagent") return this.#subagent(item);
    if (item.kind === "workflow") this.#workflowAgents(item);
    if (this.#background.has(item.itemId) || item.background) return this.#backgroundShell(item);
    if (!this.#busy) return;
    if (item.kind === "agentMessage") return this.#textItem(item, "text", item.text ?? "");
    if (item.kind === "reasoning") return this.#textItem(item, "reasoning", reasoningText(item));
    if (item.kind === "compaction") return this.#compaction(item);
    if (TOOL_ITEMS.has(item.kind)) this.#tool(item, previous);
  }

  #delta(params: ItemDeltaParams): void {
    const item = this.#items.get(params.itemId);
    if (!item || item.status !== "inProgress" || (!this.#busy && !this.#background.has(item.itemId))) return;
    const field = params.field ?? "text";
    const summary = SUMMARY_FIELD.exec(field);
    if (summary) {
      const index = Number(summary[1]);
      item.summary = [...item.summary ?? []];
      item.summary[index] = `${item.summary[index] ?? ""}${params.delta}`;
      this.#textItem(item, "reasoning", reasoningText(item));
    } else if (OUTPUT_FIELDS.has(field) && (this.#tools.has(item.itemId) || this.#background.has(item.itemId))) {
      item.visibleOutput = `${item.visibleOutput ?? ""}${params.delta}`;
      this.#options.emit({ type: "tool.output", callId: item.itemId, output: params.delta, append: true });
    } else if (field === "text") {
      item.text = `${item.text ?? ""}${params.delta}`;
      if (item.kind === "agentMessage") this.#textItem(item, "text", item.text);
      if (item.kind === "reasoning") this.#textItem(item, "reasoning", reasoningText(item));
    }
  }

  #textItem(item: Item, kind: "text" | "reasoning", text: string): void {
    const blockId = `${item.itemId}:${kind}`;
    const shown = this.#blocks.get(blockId);
    if (shown === undefined && text) this.#options.emit({ type: "block.start", blockId, block: kind });
    if (text.length > (shown ?? "").length && text.startsWith(shown ?? "")) this.#options.emit({ type: "block.delta", blockId, text: text.slice(shown?.length ?? 0) });
    if (text) this.#blocks.set(blockId, text.startsWith(shown ?? "") ? text : shown!);
    if (item.status === "inProgress" || !this.#blocks.has(blockId)) return;
    this.#options.emit({ type: "block.end", blockId });
    this.#blocks.delete(blockId);
  }

  #compaction(item: Item): void {
    const emit = this.#options.emit;
    if (item.status === "inProgress") {
      emit({ type: "compacting", active: true });
      return;
    }
    const ok = itemOk(item);
    if (this.#compacting) {
      if (!ok && !item.failureReason) this.#compacting = false;
      this.#finish(ok ? undefined : item.failureReason ?? itemOutput(item));
      return;
    }
    if (ok) emit({ type: "compacted", ...(item.tokensAfter !== undefined ? { contextTokens: item.tokensAfter } : {}) });
    else {
      emit({ type: "compacting", active: false });
      emit({ type: "notice", level: "warn", text: `Muse Code could not compact the context. ${itemOutput(item)}` });
    }
  }

  #tool(item: Item, previous: Item | undefined): void {
    const emit = this.#options.emit;
    const { name, input } = museTool(item);
    if (!this.#tools.has(item.itemId)) {
      this.#tools.add(item.itemId);
      emit({ type: "tool.start", callId: item.itemId, name, input });
    } else if (item.args !== previous?.args) emit({ type: "tool.input", callId: item.itemId, name, input });
    if (item.status === "inProgress") {
      emit({ type: "status", status: "working", tool: name });
      return;
    }
    if (this.#ended.has(item.itemId)) return;
    this.#ended.add(item.itemId);
    emit({ type: "tool.end", callId: item.itemId, ok: itemOk(item), output: itemOutput(item) });
  }

  #backgroundShell(item: Item): void {
    const emit = this.#options.emit;
    if (!this.#background.has(item.itemId)) {
      if (!this.#tools.has(item.itemId)) this.#tool(item, undefined);
      this.#background.add(item.itemId);
      emit({ type: "shell.background", callId: item.itemId, taskId: item.itemId, ...(typeof museTool(item).input.command === "string" ? { command: museTool(item).input.command as string } : {}) });
      if (!this.#ended.has(item.itemId)) {
        this.#ended.add(item.itemId);
        emit({ type: "tool.end", callId: item.itemId, ok: true, output: itemOutput(item) });
      }
    }
    if (item.status === "inProgress") return;
    this.#background.delete(item.itemId);
    this.#items.delete(item.itemId);
    emit({ type: "shell.end", callId: item.itemId, ok: itemOk(item), ...(item.status === "cancelled" ? { stopped: true } : {}), output: itemOutput(item) });
  }

  #subagent(item: Item): void {
    const title = item.objective || item.role;
    const result = item.result?.text ?? item.result?.summary ?? item.failureReason;
    this.#options.emit({ type: "subagent", id: item.itemId, ...(title ? { title, prompt: item.objective } : {}), status: childStatus(item), ...(result ? { result } : {}) });
  }

  #workflowAgents(item: Item): void {
    for (const child of item.children ?? []) {
      const status: ThreadStatus = child.terminal === undefined
        ? item.status === "inProgress" ? "working" : childStatus(item)
        : child.terminal === "completed" && !child.failureKind ? "idle" : child.terminal === "cancelled" ? "stopped" : "error";
      const result = child.failureReason ?? child.failureKind;
      this.#options.emit({ type: "subagent", id: `${item.itemId}:${child.childId}`, ...(child.label ? { title: child.label } : {}), status, ...(result ? { result } : {}) });
    }
  }

  #approval(params: ApprovalRequestParams | ApprovalUpdatedParams): void {
    const known = this.#approvals.get(params.approvalId);
    const stage = params.currentRequirementId.sourceIndex;
    if (known && stage <= known.params.currentRequirementId.sourceIndex) {
      if (stage === known.params.currentRequirementId.sourceIndex) known.params = { ...known.params, ...params };
      return;
    }
    known?.prompt.abort();
    const pending = { params: { ...known?.params, ...params } as ApprovalRequestParams, prompt: new AbortController() };
    this.#approvals.set(params.approvalId, pending);
    void this.#decide(pending).catch(error => this.#fail(errorText(error)));
  }

  #resolved(approvalId: string): void {
    this.#approvals.get(approvalId)?.prompt.abort();
    this.#approvals.delete(approvalId);
  }

  async #decide(pending: PendingApproval): Promise<void> {
    const tool = approvalTool(pending.params);
    const emit = this.#options.emit;
    let decision: Awaited<ReturnType<typeof ask>> = "allow";
    if (!autoApproved(this.#permissionMode, pending.params, this.#options.readOnly)) {
      emit({ type: "status", status: "awaiting" });
      decision = await ask(this.#options.threadId, tool.name, tool.input, { signal: pending.prompt.signal });
    }
    if (this.#approvals.get(pending.params.approvalId) !== pending || pending.prompt.signal.aborted || this.#disposed) return;
    const { params } = pending;
    const choice = approvalChoice(params.availableChoices, decision);
    try {
      await this.#host!.command("approval/decide", { sessionId: this.#sessionId, approvalId: params.approvalId, requirementId: params.currentRequirementId, choiceId: choice.choiceId });
    } catch (error) {
      if (!(error instanceof MspError && SETTLED_ELSEWHERE.has(error.kind))) throw error;
    }
    if (!this.#disposed && this.#busy) emit({ type: "status", status: "working" });
  }

  #userInput(params: UserInputRequestParams): void {
    if (this.#questions.has(params.userInputId)) return;
    const controller = new AbortController();
    this.#questions.set(params.userInputId, controller);
    void this.#answer(params, controller.signal).catch(error => this.#fail(errorText(error)));
  }

  async #answer(params: UserInputRequestParams, signal: AbortSignal): Promise<void> {
    const result = await askQuestion(this.#options.threadId, userQuestions(params.questions), { id: `muse_${params.userInputId}`, signal });
    if (!this.#questions.has(params.userInputId) || this.#disposed) return;
    this.#questions.delete(params.userInputId);
    if (result.cancelled) {
      await this.#host!.command("userInput/cancel", { sessionId: this.#sessionId, userInputId: params.userInputId, reason: QUESTION_DISMISSED });
      return;
    }
    await this.#host!.command("userInput/answer", { sessionId: this.#sessionId, userInputId: params.userInputId, answers: museAnswers(params.questions, result.answers) });
  }
}
