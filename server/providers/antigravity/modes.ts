import type { SessionConfigOption, SessionModeState } from "@agentclientprotocol/sdk";
import type { PermissionMode } from "../../../shared/protocol.ts";
import { selectChoices } from "./models.ts";

const MODE_IDS: Record<Exclude<PermissionMode, "plan">, string> = {
  manual: "default",
  acceptEdits: "auto_edit",
  bypass: "yolo",
};
const PLAN_IDS = ["plan", "architect"];
const MODE_CATEGORIES = ["mode", "collaboration_mode"];

export type ModeTarget =
  | { kind: "mode"; modeId: string; readOnly: boolean }
  | { kind: "option"; configId: string; value: string };

function available(modes: SessionModeState | null | undefined, modeId: string): string {
  if (!modes?.availableModes.some(mode => mode.id === modeId)) throw new Error(`Antigravity does not offer the ${modeId} mode.`);
  return modeId;
}

export function modeTarget(permissionMode: PermissionMode, modes: SessionModeState | null | undefined, configOptions: SessionConfigOption[] | null | undefined): ModeTarget {
  if (permissionMode !== "plan") return { kind: "mode", modeId: available(modes, MODE_IDS[permissionMode]), readOnly: false };
  const planMode = modes?.availableModes.find(mode => PLAN_IDS.includes(mode.id));
  if (planMode) return { kind: "mode", modeId: planMode.id, readOnly: false };
  for (const option of configOptions ?? []) {
    if (option.type !== "select" || !MODE_CATEGORIES.includes(option.category ?? "")) continue;
    const choice = selectChoices(option).find(entry => PLAN_IDS.includes(entry.value));
    if (choice) return { kind: "option", configId: option.id, value: choice.value };
  }
  return { kind: "mode", modeId: available(modes, MODE_IDS.manual), readOnly: true };
}
