import type { Attachment, ProviderId, Usage } from "./protocol.ts";

interface WorktreeInfo {
  path: string;
  branch: string;
  current: boolean;
  locked: boolean;
}

export interface WorkspaceOptions {
  worktrees: WorktreeInfo[];
  branches: string[];
  hasCommits: boolean;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  path: string;
  provider: ProviderId;
  scope: "project" | "personal" | "plugin";
  enabled: boolean;
  providerManaged?: boolean;
}

export interface ProviderCommand {
  name: string;
  description: string;
  argumentHint?: string;
}

export interface FilePreviewData {
  name: string;
  path: string;
  mime: string;
  size: number;
  text?: string;
  truncated?: boolean;
}

export interface UsageWindow {
  label: string;
  usedPercent: number;
  resetsAt?: number;
}

export interface ProviderUsage {
  provider: ProviderId;
  windows: UsageWindow[];
  error?: string;
  plan?: string;
  updatedAt: number;
}

export type UsageSpeed = "fast" | "ultrafast";

export const COST_TYPES = ["input", "cacheRead", "cacheWrite", "output"] as const;

export type CostByType = Record<(typeof COST_TYPES)[number], number>;

export interface UsageDay {
  day: string;
  provider: ProviderId;
  model?: string;
  speed?: UsageSpeed;
  unpriced?: boolean;
  costByType?: CostByType;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
  turns: number;
}

export interface UsagePricing {
  fetchedAt?: number;
  error?: string;
}

export interface UsageReport {
  totals: Usage;
  history: UsageDay[];
  pricing: UsagePricing;
  providers: ProviderUsage[];
  conversations: Array<{
    id: string;
    title: string;
    projectId: string;
    provider: ProviderId;
    model?: string;
    usage: Usage;
    updatedAt: number;
  }>;
}

export interface DiagnosticReport {
  protocol?: Array<{ at: number; provider: ProviderId; threadId: string; type: string; issue?: string }>;
  sampledAt: number;
  uptime: number;
  system: {
    memoryTotal: number;
    memoryFree: number;
    cores: number;
    load: number[];
  };
  server: { pid: number; rss: number; heapUsed: number; heapTotal: number };
  processes: Array<{
    pid: number;
    parent: number;
    name: string;
    cpu: number | null;
    memory: number;
    startedAt?: string;
  }>;
  conversations: number;
  running: number;
  terminals: number;
  browsers: number;
}

export interface BrowserProfile {
  id: string;
  name: string;
  projectId: string;
  cookies: number;
  activeTabs: number;
}

export interface ImportBrowser {
  id: string;
  name: string;
  browser: string;
}

export interface ComposerDraft {
  text: string;
  attachments: Attachment[];
}
