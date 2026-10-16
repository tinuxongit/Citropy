import { usableProviderAccount } from "./providers/provider-account.ts";
import { store } from "./store.ts";
import { chooseThreadWorkspace } from "./workspaces.ts";
import { modelSettings } from "../shared/model-options.ts";
import { resolveProjectSettings } from "../shared/project-settings.ts";
import type { ProviderInfo, Thread, ThreadMeta } from "../shared/protocol.ts";

export async function createRequestedThread(input: Record<string, any>, providers: ProviderInfo[], extra: Pick<ThreadMeta, "title" | "botId" | "groupId" | "workspacePath"> = { title: "New thread" }): Promise<Thread> {
  const project = store.projects.get(input.projectId);
  if (!project) throw new Error("Workspace not found");
  const defaults = resolveProjectSettings(store.projectDefaults, project.settings);
  const instanceId = input.providerInstanceId;
  if (instanceId !== undefined && typeof instanceId !== "string") throw new Error("Invalid provider instance.");
  const { provider, models } = usableProviderAccount(
    providers.find((entry) => entry.id === (input.provider ?? defaults?.provider)),
    instanceId,
  );
  if (input.model && !models.some(model => model.id === input.model)) throw new Error("This model is not available for the selected provider instance.");
  if (
    input.permissionMode &&
    !["manual", "acceptEdits", "plan", "bypass"].includes(
      input.permissionMode,
    )
  )
    throw new Error("Unknown permission mode");
  const workspace = await chooseThreadWorkspace(project, input.workspace);
  return store.createThread({
    projectId: project.id,
    provider: provider.id,
    providerInstanceId: instanceId,
    ...workspace,
    ...modelSettings(models, {
      model:
        input.model ??
        (!instanceId && provider.id === defaults?.provider ? defaults.model : undefined),
      effort: input.effort ?? (!instanceId && provider.id === defaults.provider && (!input.model || input.model === defaults.model) ? defaults.effort : undefined),
      contextWindow: input.contextWindow,
      fastMode: input.fastMode,
    }),
    permissionMode:
      input.permissionMode ?? defaults?.permissionMode ?? "manual",
    ...extra,
  });
}
