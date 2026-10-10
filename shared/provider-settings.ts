import type { ProviderId } from "./protocol.ts";

export const GLOBAL_INSTRUCTION_PROVIDERS: readonly ProviderId[] = ["claude", "codex", "opencode"];

export interface ProviderMaintenance {
  provider: ProviderId;
  status: "idle" | "updating" | "success" | "error";
  available: boolean;
  install?: boolean;
  updateStatus?: "available" | "current" | "unknown";
  latestVersion?: string;
  checkedAt?: number;
  version?: string;
  binaryPath?: string;
  method?: string;
  command?: string;
  reason?: string;
  message?: string;
  output?: string;
}

export interface ProviderSignIn {
  provider: ProviderId;
  instanceId?: string;
  signedIn?: boolean;
  error?: string;
  flow?: SignInFlow;
}

export interface SignInFlow {
  status: "starting" | "waiting" | "verifying" | "failed";
  url?: string;
  error?: string;
}

export interface GlobalInstructions {
  provider: ProviderId;
  path: string;
  exists: boolean;
  content: string;
  revision: string;
  note?: string;
}
