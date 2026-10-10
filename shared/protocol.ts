import type { DropEdge } from "./move-beside.ts";
import type { QuestionPart, QuestionRequest } from "./questions.ts";
import type { GitHubRequest, GitHubResponse } from "./github.ts";
import type { BrowserAction, BrowserState, PanelKind, PanelTab, ToolConnection, ToolDefinition } from "./workbench.ts";

export const PROVIDER_IDS = ["claude", "codex", "opencode", "antigravity"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

export type ThreadStatus =
  | "idle"
  | "queued"
  | "thinking"
  | "working"
  | "awaiting"
  | "error"
  | "stopped";

type ToolStatus = "running" | "ok" | "error" | "denied" | "stopped";

export type ToolShape =
  | "command"
  | "read"
  | "write"
  | "edit"
  | "search"
  | "web"
  | "computer"
  | "task"
  | "todo"
  | "generic";

export interface ToolImage {
  id: string;
  mime: string;
}

export interface ImageFile {
  path: string;
  label: string;
}

export interface ToolPart {
  id: string;
  kind: "tool";
  callId: string;
  name: string;
  shape: ToolShape;
  headline: string;
  detail?: string;
  input: unknown;
  status: ToolStatus;
  output?: string;
  images?: ToolImage[];
  imageFiles?: ImageFile[];
  patch?: FilePatch;
  hits?: string[];
  startedAt: number;
  endedAt?: number;
}

export interface ShellProcess {
  busy?: boolean;
  process?: string;
  id: string;
  projectId: string;
  threadId?: string;
  panelId?: string;
  command: string;
  cwd: string;
  status: "running" | "stopping" | "finished" | "failed" | "stopped";
  background: boolean;
  output: string;
  startedAt: number;
  endedAt?: number;
}

interface TextPart {
  id: string;
  kind: "text";
  text: string;
  complete?: boolean;
  endedAt?: number;
}

export interface ReasoningPart {
  id: string;
  kind: "reasoning";
  text: string;
  complete?: boolean;
  endedAt?: number;
}

export interface TodoItem {
  text: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

interface TodoPart {
  id: string;
  kind: "todo";
  items: TodoItem[];
}

export interface FilePatch {
  path: string;
  added: number;
  removed: number;
  hunks: PatchHunk[];
  truncated?: boolean;
}

export interface PatchHunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: PatchLine[];
}

export interface PatchLine {
  type: "add" | "del" | "ctx";
  text: string;
  oldNo?: number;
  newNo?: number;
}

interface PatchPart {
  id: string;
  kind: "patch";
  patch: FilePatch;
}

interface NoticePart {
  id: string;
  kind: "notice";
  level: "info" | "warn" | "error";
  text: string;
}

export interface ImagesPart {
  id: string;
  kind: "images";
  files: ImageFile[];
}

export interface ChangedFile {
  path: string;
  added: number;
  removed: number;
}

export interface ChangesPart {
  id: string;
  kind: "changes";
  checkpoint: string;
  files: ChangedFile[];
}

export type Part = TextPart | ReasoningPart | ToolPart | TodoPart | PatchPart | NoticePart | QuestionPart | ImagesPart | ChangesPart;

export interface Attachment {
  id?: string;
  mime?: string;
  size?: number;
  path: string;
  label: string;
}

export interface Message {
  provider?: ProviderId;
  contextSources?: import("./context.ts").ContextSource[];
  id: string;
  role: "user" | "assistant" | "system";
  parts: Part[];
  ts: number;
  model?: string;
  attachments?: Attachment[];
  mentions?: import("./mention-tags.ts").MentionTag[];
}

export interface HistoryPage {
  before?: string;
  next?: string;
  revision: number;
}

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: Attachment[];
  createdAt: number;
}

export interface Usage {
  codexTotals?: { input: number; output: number; cacheRead: number; cacheWrite: number };
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  contextTokens: number;
  contextMax: number;
  turns: number;
  tokensPerSecond?: number;
}

export const emptyUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd: 0,
  contextTokens: 0,
  contextMax: 0,
  turns: 0,
});

export interface Project {
  id: string;
  path: string;
  name: string;
  isGit: boolean;
  branch?: string;
  lastOpened: number;
  settings?: FolderSettings;
  scripts?: ProjectScript[];
}

export interface ProjectScript {
  id: string;
  name: string;
  command: string;
}

export interface FolderSettings {
  provider?: ProviderId | null;
  model?: string;
  effort?: string;
  permissionMode?: PermissionMode;
  workspace?: "current" | "new";
  autoPull?: boolean;
}

export interface ProjectSettings extends FolderSettings {
  browserAccess?: boolean;
  browserFirst?: boolean;
  visualReplies?: boolean;
}

export interface WorkspaceChoice {
  kind: "current" | "new" | "existing";
  path?: string;
  branch?: string;
  base?: string;
}

export interface ThreadMeta {
  pendingConfig?: Pick<ThreadMeta, "model" | "effort" | "contextWindow" | "fastMode" | "permissionMode">;
  transferContext?: string;
  transfers?: Array<{ provider: ProviderId; providerInstanceId?: string; model?: string; externalId?: string; usage: Usage; at: number }>;
  checkpoints?: import("./review.ts").TurnCheckpoint[];
  branchedFrom?: { threadId: string; messageId: string };
  rebuildContext?: boolean;
  canRedo?: boolean;
  id: string;
  projectId: string;
  provider: ProviderId;
  providerInstanceId?: string;
  model?: string;
  effort?: string;
  contextWindow?: number;
  fastMode?: boolean;
  title: string;
  createdAt: number;
  updatedAt: number;
  status: ThreadStatus;
  changedFiles?: number;
  activeTool?: string;
  usage: Usage;
  permissionMode: PermissionMode;
  externalId?: string;
  running: boolean;
  runStartedAt?: number;
  runCount?: number;
  gitAction?: import("./assistance.ts").GitActionState;
  finished?: boolean;
  pinned?: boolean;
  position?: number;
  snoozedUntil?: number;
  archived?: boolean;
  pullRequest?: string;
  workspacePath?: string;
  workspaceBranch?: string;
  compacting?: "manual" | "automatic";
  compactedAt?: number;
  parentThreadId?: string;
  parentMessageId?: string;
  nativeAgentId?: string;
  error?: string;
  usageLimit?: UsageLimitState;
  queue?: QueuedMessage[];
}

export interface UsageLimitState {
  at: number;
  resetsAt?: number;
  checkedAt?: number;
  resume: boolean;
}

export type PermissionMode = "plan" | "manual" | "acceptEdits" | "bypass";

export interface Thread extends ThreadMeta {
  messages: Message[];
}

export interface GitFile {
  path: string;
  index: string;
  work: string;
  added: number;
  removed: number;
  staged: boolean;
  untracked: boolean;
}

export interface GitStatus {
  branch: string;
  upstream?: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  clean: boolean;
}

export interface PermissionRequest {
  id: string;
  threadId: string;
  tool: string;
  shape: ToolShape;
  headline: string;
  detail?: string;
  input: unknown;
  createdAt: number;
}

export interface ProviderInfo {
  id: ProviderId;
  label: string;
  available: boolean;
  enabled: boolean;
  version?: string;
  binary?: string;
  models: ModelOption[];
  supportsPermissionPrompt: boolean;
  capabilities?: { transport: "stdio" | "rpc" | "http"; steer: boolean; compact: boolean; stopShell: boolean };
  signIn?: "terminal" | "app";
  steerHint?: string;
  modelsError?: string;
  modelsUpdatedAt?: number;
  instances?: Array<{ id: string; name: string; available: boolean; version?: string; models: ModelOption[]; modelsError?: string }>;
  activeInstanceId?: string;
  openCodeVersion?: { setting: OpenCodeVersionSetting; active?: OpenCodeMajor };
}

export type OpenCodeMajor = 1 | 2;
export type OpenCodeVersionSetting = "auto" | OpenCodeMajor;

export interface ProviderInstance {
  id: string;
  provider: ProviderId;
  name: string;
  binary?: string;
  environment: Record<string, string>;
}

export interface ModelOption {
  contextMax?: number;
  contextWindows?: number[];
  aliases?: string[];
  fastMode?: boolean;
  fastModeHint?: string;
  fastModeTier?: "priority" | "fast";
  efforts?: string[];
  defaultEffort?: string;
  resolvedModel?: string;
  isDefault?: boolean;
  id: string;
  label: string;
  hint?: string;
}

export interface NotificationPreferences {
  toasts: boolean;
  desktop: boolean;
  sound: boolean;
  subagents: boolean;
}

export interface NotificationTarget {
  view: "chat" | "git" | "github" | "settings";
  section?: "Providers" | "Application";
  projectId?: string;
  threadId?: string;
}

export interface AppNotification {
  id: string;
  title: string;
  text: string;
  level: "success" | "error" | "info";
  kind: "chat" | "git" | "github" | "update";
  dedupeKey?: string;
  createdAt: number;
  read: boolean;
  target: NotificationTarget;
}

export interface Snapshot {
  historyPaging?: boolean;
  shells?: ShellProcess[];
  projectDefaults?: ProjectSettings;
  assistance?: import("./assistance.ts").AssistanceSettings;
  notifications?: AppNotification[];
  notificationPreferences?: NotificationPreferences;
  logging?: { enabled: boolean; file: string };
  resumeAfterLimits?: boolean;
  setupNeeded?: boolean;
  panels?: PanelTab[];
  browsers?: BrowserState[];
  toolConnections?: ToolConnection[];
  tools?: ToolDefinition[];
  permissions: PermissionRequest[];
  questions?: QuestionRequest[];
  development?: boolean;
  usingAppData?: boolean;
  projects: Project[];
  threads: ThreadMeta[];
  providers: ProviderInfo[];
  activeProjectId?: string;
  home: string;
}

export type ServerEvent = (
  | { t: "event.batch"; after: number; events: ServerEvent[] }
  | { t: "shell.upsert"; shell: ShellProcess }
  | { t: "shell.remove"; id: string }
  | { t: "project.defaults"; settings: ProjectSettings }
  | { t: "assistance.settings"; settings: import("./assistance.ts").AssistanceSettings }
  | { t: "thread.accepted"; requestId: string }
  | { t: "request.error"; requestId: string; error: string }
  | { t: "notification.add"; notification: AppNotification }
  | { t: "notifications.update"; notifications: AppNotification[] }
  | { t: "notifications.preferences"; preferences: NotificationPreferences }
  | { t: "logging"; enabled: boolean }
  | { t: "limits.resume"; enabled: boolean }
  | { t: "panel.upsert"; panel: PanelTab; background?: boolean }
  | { t: "panel.remove"; id: string }
  | { t: "panel.order"; projectId: string; ids: string[] }
  | { t: "browser.state"; browser: BrowserState }
  | { t: "tools.connection"; connection: ToolConnection }
  | { t: "github.result"; requestId: string; result?: GitHubResponse; error?: string }
  | { t: "git.manage"; requestId: string; result?: GitResult; error?: string }
  | { t: "thread.search"; query: string; results: Array<{ threadId: string; messageId?: string; snippet: string }> }
  | { t: "project.chosen"; projectId: string | null; error?: string }
  | { t: "providers.update"; providers: ProviderInfo[] }
  | { t: "hello"; snapshot: Snapshot; epoch?: string }
  | { t: "reconnected"; epoch: string; shells?: ShellProcess[]; browsers?: BrowserState[] }
  | { t: "project.upsert"; project: Project }
  | { t: "project.remove"; id: string }
  | { t: "thread.upsert"; thread: ThreadMeta }
  | { t: "thread.remove"; id: string }
  | { t: "thread.messages"; threadId: string; messages: Message[]; page?: HistoryPage; requestId?: string }
  | { t: "message.add"; threadId: string; message: Message }
  | { t: "part.add"; threadId: string; messageId: string; part: Part }
  | { t: "part.append"; threadId: string; messageId: string; partId: string; text: string }
  | { t: "part.patch"; threadId: string; messageId: string; partId: string; patch: Record<string, unknown> }
  | { t: "permission.request"; request: PermissionRequest }
  | { t: "permission.close"; id: string }
  | { t: "question.request"; request: QuestionRequest }
  | { t: "question.close"; id: string }
  | { t: "git.status"; projectId: string; threadId?: string; status: GitStatus }
  | { t: "git.diff"; requestId: string; patch: FilePatch | null; error?: string }
  | { t: "term.data"; termId: string; data: string; streamId?: string; reset?: boolean; offset?: number; sessionId?: string }
  | { t: "term.exit"; termId: string; code: number; offset?: number; sessionId?: string }
  | { t: "toast"; level: "info" | "warn" | "error" | "success"; text: string }
) & { sequence?: number };

export interface FileEntry {
  name: string;
  path: string;
  dir: boolean;
  size?: number;
}

export type ClientEvent = (
  | { t: "notifications.read"; ids?: string[] }
  | { t: "notifications.clear" }
  | {
      t: "notifications.configure";
      preferences: Partial<NotificationPreferences>;
    }
  | { t: "panel.open"; projectId: string; kind: PanelKind; id?: string; threadId?: string; url?: string; background?: boolean }
  | { t: "panel.close"; id: string }
  | { t: "panel.rename"; id: string; title: string }
  | { t: "panel.move"; id: string; targetId: string; edge: DropEdge }
  | { t: "browser.action"; id: string; input: BrowserAction }
  | { t: "desktop.open" }
  | { t: "logging.configure"; enabled: boolean }
  | { t: "limits.configure"; resumeAfterLimits: boolean }
  | { t: "setup.finish" }
  | { t: "thread.resumeAfterLimit"; id: string; enabled: boolean }
  | { t: "thread.discardPlan"; id: string }
  | { t: "client.error"; message: string }
  | { t: "server.restart" }
  | { t: "server.useAppData"; enabled: boolean }
  | { t: "thread.finish"; id: string; finished: boolean }
  | { t: "github.request"; requestId: string; request: GitHubRequest }
  | { t: "git.manage"; requestId: string; projectId: string; threadId?: string; operation: GitOperation; value?: string; offset?: number; remote?: string }
  | { t: "thread.search"; query: string }
  | { t: "project.choose"; path?: string }
  | { t: "providers.refresh"; force?: boolean }
  | { t: "providers.configure"; provider: ProviderId; enabled: boolean }
  | { t: "providers.activeAccount"; provider: ProviderId; instanceId: string | null }
  | { t: "providers.opencodeVersion"; setting: OpenCodeVersionSetting }
  | { t: "project.open"; path: string }
  | { t: "project.rename"; id: string; name: string }
  | { t: "project.close"; id: string }
  | { t: "project.scripts"; id: string; scripts: ProjectScript[] }
  | { t: "project.runScript"; projectId: string; threadId?: string; scriptId: string }
  | { t: "project.runCommand"; projectId: string; threadId?: string; command: string }
  | {
      t: "thread.create";
      projectId: string;
      provider: ProviderId;
      providerInstanceId?: string;
      model?: string;
      effort?: string | null;
      contextWindow?: number;
      fastMode?: boolean;
      permissionMode?: PermissionMode;
      title?: string;
      workspace?: WorkspaceChoice;
    }
  | {
      t: "thread.send";
      requestId?: string;
      threadId: string;
      text: string;
      attachments?: Attachment[];
    }
  | { t: "thread.stop"; threadId: string }
  | { t: "queue.send"; threadId: string; id: string }
  | { t: "queue.remove"; threadId: string; id: string }
  | { t: "queue.move"; threadId: string; id: string; index: number }
  | { t: "queue.edit"; requestId: string; threadId: string; id: string }
  | { t: "thread.remove"; id: string }
  | { t: "thread.load"; id: string; page?: { before?: string; revision?: number }; requestId?: string }
  | { t: "thread.subscribe"; ids: string[] }
  | {
      t: "thread.config";
      id: string;
      requestId?: string;
      provider?: ProviderId;
      providerInstanceId?: string | null;
      model?: string;
      effort?: string | null;
      contextWindow?: number;
      fastMode?: boolean;
      permissionMode?: PermissionMode;
      title?: string;
    }
  | {
      t: "permission.answer";
      id: string;
      decision: "allow" | "allow_always" | "deny";
    }
  | { t: "git.refresh"; projectId: string }
  | { t: "git.diff"; requestId: string; projectId: string; path: string; staged?: boolean }
  | { t: "git.commit"; projectId: string; message: string }
  | { t: "git.discard"; projectId: string; path: string }
  | ({ t: "term.open"; termId: string; cols: number; rows: number; flowControl?: boolean; offset?: number; sessionId?: string } & TerminalTarget)
  | { t: "term.ack"; termId: string; count: number; streamId: string }
  | { t: "term.unsubscribe"; termId: string }
  | { t: "term.data"; termId: string; data: string }
  | { t: "term.resize"; termId: string; cols: number; rows: number }
  | { t: "term.close"; termId: string }
) & { threadId?: string };

export type TerminalTarget = { projectId: string } | { signIn: ProviderId; instanceId?: string };

export function signInTerminalId(provider: ProviderId, instanceId?: string): string {
  return instanceId ? `sign-in-${provider}-${instanceId}` : `sign-in-${provider}`;
}

export interface GitOverview {
  repository: boolean;
  hasCommits: boolean;
  mergeInProgress: boolean;
  status?: GitStatus;
  branches: Array<{ name: string; current: boolean; remote: boolean; upstream: string; subject: string; date: string }>;
  commits: Array<{ hash: string; author: string; date: string; subject: string; refs: string }>;
  remotes: Array<{ name: string; url: string }>;
  stashes: Array<{ ref: string; subject: string }>;
}

interface GitDetail {
  kind: "detail";
  message: string;
  patches: FilePatch[];
}

export type GitResult = GitOverview | GitDetail | string;

export type GitOperation = "overview" | "history" | "show" | "showStash" | "init" | "stage" | "unstage" | "stageAll" | "unstageAll" | "commit" | "createBranch" | "switchBranch" | "deleteBranch" | "merge" | "abortMerge" | "fetch" | "pull" | "push" | "stash" | "applyStash" | "dropStash" | "addRemote" | "removeRemote" | "publish" | "discardWorktree";
