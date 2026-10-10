import type { ReactNode } from "react";
import { selectedModel } from "../../../../shared/model-options.ts";
import type { FolderSettings, ProjectSettings } from "../../../../shared/protocol.ts";
import { useApp } from "../../lib/store.ts";
import { PERMISSION_MODES } from "../composer/ComposerOptions.tsx";
import { ModelPicker } from "../ModelPicker.tsx";
import { Select } from "../Select.tsx";
import { LAST_SELECTED_MODEL } from "./project-summary.ts";
import { WORKSPACE_CHOICES } from "./workspace-choices.ts";

const SETTINGS = { menuWidth: 280 };

type OptionKey = "model" | "permissionMode" | "workspace" | "autoPull";

const DEFAULT_PATCH: Record<OptionKey, FolderSettings> = {
  model: { provider: undefined, model: undefined, effort: undefined },
  permissionMode: { permissionMode: undefined },
  workspace: { workspace: undefined },
  autoPull: { autoPull: undefined },
};

function isOverridden(overrides: FolderSettings, key: OptionKey): boolean {
  return (key === "model" ? overrides.provider : overrides[key]) !== undefined;
}

export function ProjectOptionRows({ settings, overrides, update }: {
  settings: ProjectSettings;
  overrides?: FolderSettings;
  update: (patch: FolderSettings) => void;
}) {
  const providers = useApp((state) => state.providers);
  const model = selectedModel(providers.find(entry => entry.id === settings.provider)?.models ?? [], settings.model);
  const row = (key: OptionKey, title: string, detail: string, control: ReactNode) => (
    <div className="setting-row project-option-row">
      <span><strong>{title}</strong><small>{detail}</small></span>
      <div className="project-option-control">
        {overrides && isOverridden(overrides, key) && (
          <button className="btn" data-variant="ghost" type="button" aria-label={`Use default ${title.toLowerCase()}`}
            onClick={() => update(DEFAULT_PATCH[key])}>Use default</button>
        )}
        {control}
      </div>
    </div>
  );
  return <>
    {row("model", "Model", "The model and effort new chats start with.", <ModelPicker
      label="Default model"
      defaultOnly
      value={settings.provider ? { provider: settings.provider, model: settings.model ?? "" } : null}
      automaticLabel={LAST_SELECTED_MODEL}
      onChange={(choice) => update({ provider: choice?.provider ?? null, model: choice?.model, effort: undefined })}
      tune={{ settings: { effort: settings.effort }, only: ["effort"], onChange: (patch) => update({ provider: settings.provider ?? null, model: model?.id, effort: patch.effort }) }}
    />)}
    {row("permissionMode", "Permissions", "What agents may do without asking you first.", <Select aria-label="Permissions" width={SETTINGS.menuWidth}
      value={settings.permissionMode}
      onChange={(value) => update({ permissionMode: value as FolderSettings["permissionMode"] })}
      options={PERMISSION_MODES.map(entry => ({ value: entry.id, label: entry.label, hint: entry.hint }))} />)}
    {row("workspace", "Workspace", "Work in the folder itself, or in a separate copy on its own branch.", <Select aria-label="Workspace" width={SETTINGS.menuWidth}
      value={settings.workspace}
      onChange={(value) => update({ workspace: value as FolderSettings["workspace"] })}
      options={WORKSPACE_CHOICES.filter(entry => entry.id !== "existing").map(entry => ({ value: entry.id, label: entry.label, hint: entry.detail }))} />)}
    {row("autoPull", "Pull before starting", "Get the latest changes first when the folder has no local work.", <input
      className="setting-switch" type="checkbox" role="switch" aria-label="Pull before starting"
      checked={Boolean(settings.autoPull)}
      onChange={(event) => update({ autoPull: event.target.checked })} />)}
  </>;
}
