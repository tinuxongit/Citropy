import type {
  ApprovalChoice,
  ApprovalMode,
  ApprovalRequestParams,
} from "@muse-code/sdk/dist/src/msp.js";
import type { PermissionMode } from "../../../shared/protocol.ts";
import { toolCall, type MuseTool } from "./tools.ts";

type Decision = "allow" | "allow_always" | "deny";

export const APPROVAL_MODES: Record<PermissionMode, ApprovalMode> = {
  manual: "promptUnmatched",
  acceptEdits: "promptUnmatched",
  plan: "denyUnmatched",
  bypass: "allowAll",
};

const AUTO_APPROVED: Record<PermissionMode, string[]> = {
  manual: [],
  acceptEdits: ["Edit", "Write"],
  plan: [],
  bypass: [],
};

const AUTO_APPROVABLE_SUBJECTS = new Set(["fileAccess", "tool"]);

// Chats look things up on the web without asking each time.
const CHAT_APPROVED = new Set(["WebFetch", "WebSearch"]);
const CHAT_SUBJECTS = new Set(["network", "tool"]);

export const SETTLED_ELSEWHERE = new Set(["approvalAlreadyResolved", "approvalRequirementStale"]);

const PREFERENCES: Record<Decision, Array<{ decision: string; scope?: string }>> = {
  allow: [{ decision: "approved" }],
  allow_always: [
    { decision: "approvedForSession" },
    { decision: "approvedPolicyAmendment", scope: "session" },
    { decision: "approved" },
  ],
  deny: [{ decision: "denied" }, { decision: "abort" }],
};

const SCOPE_ORDER = ["once", "session", "localPersistent"];

export function approvalTool(params: ApprovalRequestParams): MuseTool {
  const { subject } = params;
  const tool = toolCall(subject.toolName ?? params.toolName, params.rawArgs);
  return {
    name: tool.name,
    input: {
      ...tool.input,
      ...(subject.command ? { command: subject.command } : {}),
      ...(subject.path ? { file_path: subject.path } : {}),
      ...(subject.host ? { url: subject.host } : {}),
      ...(subject.access ? { access: subject.access } : {}),
    },
  };
}

export function autoApproved(
  permissionMode: PermissionMode,
  params: ApprovalRequestParams,
  chat = false,
): boolean {
  if (params.protectedWrite) return false;
  const name = approvalTool(params).name;
  if (chat) return CHAT_SUBJECTS.has(params.subject.kind) && CHAT_APPROVED.has(name);
  return (
    AUTO_APPROVABLE_SUBJECTS.has(params.subject.kind) &&
    AUTO_APPROVED[permissionMode].includes(name)
  );
}

export function approvalChoice(choices: ApprovalChoice[], decision: Decision): ApprovalChoice {
  const ordered = [...choices].sort(
    (a, b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope),
  );
  for (const wanted of PREFERENCES[decision]) {
    const choice = ordered.find(
      (entry) =>
        entry.decision === wanted.decision && (!wanted.scope || entry.scope === wanted.scope),
    );
    if (choice) return choice;
  }
  throw new Error(
    `Muse Code offered no way to ${decision === "deny" ? "deny" : "allow"} this request.`,
  );
}
