import { selectedModel } from "../../../../shared/model-options.ts";
import type { FolderSettings, ProviderInfo } from "../../../../shared/protocol.ts";
import { PERMISSION_MODES } from "../composer/ComposerOptions.tsx";
import { WORKSPACE_CHOICES } from "./workspace-choices.ts";

export const LAST_SELECTED_MODEL = "Last selected model";

export function permissionLabel(mode: FolderSettings["permissionMode"]): string {
  return PERMISSION_MODES.find(entry => entry.id === mode)!.label;
}

export function workspaceLabel(workspace: FolderSettings["workspace"]): string {
  return WORKSPACE_CHOICES.find(entry => entry.id === workspace)!.label;
}

function modelLabel(settings: FolderSettings, providers: ProviderInfo[]): string {
  if (!settings.provider) return LAST_SELECTED_MODEL;
  const provider = providers.find(entry => entry.id === settings.provider);
  return selectedModel(provider?.models ?? [], settings.model)?.label ?? settings.model ?? settings.provider;
}

export function projectSummary(overrides: FolderSettings, providers: ProviderInfo[]): string {
  const changes = [
    overrides.provider !== undefined && modelLabel(overrides, providers),
    overrides.permissionMode && permissionLabel(overrides.permissionMode),
    overrides.workspace && workspaceLabel(overrides.workspace),
    overrides.autoPull !== undefined && (overrides.autoPull ? "Pulls first" : "Doesn't pull first"),
  ].filter(Boolean);
  return changes.length ? `Own settings: ${changes.join(", ")}` : "Uses your defaults";
}
