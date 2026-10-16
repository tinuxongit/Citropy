import { gitActionBusy } from "../../../../shared/assistance.ts";
import { nextTurnSettings, selectedModel } from "../../../../shared/model-options.ts";
import { providerAccount } from "../../../../shared/provider-account.ts";
import { configureThread } from "../../lib/actions.ts";
import { useApp } from "../../lib/store.ts";
import { hasConversation } from "../../lib/thread-started.ts";
import { ModelTuning } from "../composer/ComposerOptions.tsx";
import { useModelTransfer } from "../composer/use-model-transfer.tsx";
import { ModelPicker } from "../ModelPicker.tsx";

// The bot's chat takes its model, effort, context and speed from here instead of the composer bar.
export function BotModel({ threadId }: { threadId: string }) {
  const thread = useApp((state) => state.threads[threadId]);
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const conversing = useApp((state) => hasConversation(state, threadId));
  const { transferring, transfer, tuning } = useModelTransfer(thread);
  if (!thread) return null;
  const configured = { ...thread, ...nextTurnSettings(thread) };
  const provider = providers.find((entry) => entry.id === thread.provider);
  const model = selectedModel(
    providerAccount(provider, thread.providerInstanceId).models,
    configured.model,
  );
  const running = thread.running ?? false;
  return (
    <div className="feature-field bot-model">
      <span>Model</span>
      <ModelPicker
        value={{
          provider: thread.provider,
          providerInstanceId: thread.providerInstanceId,
          model: configured.model ?? model?.id ?? "default",
        }}
        label="Model"
        disabled={!connected || transferring}
        lockedProvider={
          running || conversing || thread.externalId || thread.usage.turns || thread.queue?.length
            ? thread.provider
            : undefined
        }
        instanceId={thread.providerInstanceId}
        onTransfer={(choice) => void transfer(choice)}
        transferDisabled={Boolean(
          !conversing ||
          running ||
          thread.queue?.length ||
          thread.compacting ||
          gitActionBusy(thread.gitAction),
        )}
        onChange={(choice) => {
          if (choice)
            configureThread(thread.id, {
              ...choice,
              providerInstanceId: choice.providerInstanceId ?? null,
              effort: null,
            });
        }}
        tune={{ settings: configured, onChange: (patch) => configureThread(thread.id, patch) }}
        tuning={(target) =>
          target ? (
            tuning(target)
          ) : (
            <ModelTuning
              key={`${thread.provider}:${model?.id}`}
              settings={configured}
              model={model}
              onChange={(patch) => configureThread(thread.id, patch)}
            />
          )
        }
      />
    </div>
  );
}
