import type { FolderSettings, ProjectSettings } from "./protocol.ts";

export const GLOBAL_SWITCHES = ["browserAccess", "browserFirst", "visualReplies"] as const;

export function resolveProjectSettings(
  defaults: ProjectSettings = {},
  overrides: FolderSettings = {},
): ProjectSettings {
  const model = overrides.provider !== undefined ? overrides : defaults;
  return {
    provider: model.provider,
    model: model.model,
    effort: model.effort,
    permissionMode: overrides.permissionMode ?? defaults.permissionMode ?? "manual",
    workspace: overrides.workspace ?? defaults.workspace ?? "current",
    autoPull: overrides.autoPull ?? defaults.autoPull ?? false,
    browserAccess: defaults.browserAccess ?? true,
    browserFirst: defaults.browserFirst ?? true,
    visualReplies: defaults.visualReplies ?? true,
  };
}
