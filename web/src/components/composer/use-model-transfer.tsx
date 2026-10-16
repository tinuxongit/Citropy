import { useMemo, useState } from "react";
import type { WritingModel } from "../../../../shared/assistance.ts";
import { selectedModel } from "../../../../shared/model-options.ts";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import { providerAccount } from "../../../../shared/provider-account.ts";
import { api, reportError } from "../../lib/api.ts";
import { environmentSignal } from "../../lib/environment.ts";
import { confirmAction, useApp } from "../../lib/store.ts";
import { ModelTuning, type TuningSettings } from "./ComposerOptions.tsx";

// Hands a conversation to another model. The composer and bot settings both offer it from their model picker.
export function useModelTransfer(thread: ThreadMeta | undefined) {
  const [scopeSignal] = useState(environmentSignal);
  const providers = useApp((state) => state.providers);
  const [transferring, setTransferring] = useState(false);
  const [transferSettings, setTransferSettings] = useState<{
    key: string;
    settings: TuningSettings;
  }>({ key: "", settings: {} });
  return useMemo(() => {
    const transferKey = (choice: WritingModel) =>
      `${choice.provider}:${choice.providerInstanceId ?? ""}:${choice.model}`;
    const settingsFor = (choice: WritingModel) =>
      transferSettings.key === transferKey(choice) ? transferSettings.settings : {};
    const modelFor = (choice: WritingModel) => {
      const target = providers.find((entry) => entry.id === choice.provider);
      return selectedModel(providerAccount(target, choice.providerInstanceId).models, choice.model);
    };
    const transfer = async (choice: WritingModel) => {
      if (!thread || transferring) return;
      const target = providers.find((entry) => entry.id === choice.provider);
      const { instance } = providerAccount(target, choice.providerInstanceId);
      const name = modelFor(choice)?.label ?? choice.model;
      if (
        !(await confirmAction({
          title: `Transfer to ${name}?`,
          description:
            "A new agent reads the conversation and continues here. This uses extra usage on the selected provider and may cost more. Your chat history, workspace and draft stay in place.",
          context: instance ? `${target?.label} · ${instance.name}` : target?.label,
          label: "Transfer and continue",
        })) ||
        scopeSignal.aborted ||
        !useApp.getState().connected
      )
        return;
      setTransferring(true);
      try {
        await api(`threads/transfer?threadId=${thread.id}`, {
          method: "POST",
          body: JSON.stringify({ ...choice, ...settingsFor(choice) }),
        });
      } catch (error) {
        reportError(error);
      } finally {
        if (!scopeSignal.aborted) setTransferring(false);
      }
    };
    const tuning = (target: WritingModel) => (
      <ModelTuning
        key={transferKey(target)}
        settings={settingsFor(target)}
        model={modelFor(target)}
        onChange={(patch) =>
          setTransferSettings({
            key: transferKey(target),
            settings: { ...settingsFor(target), ...patch },
          })
        }
      />
    );
    return { transferring, transfer, tuning };
  }, [thread, providers, transferring, transferSettings, scopeSignal]);
}
