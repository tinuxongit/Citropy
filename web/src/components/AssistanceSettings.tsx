import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useApp } from "../lib/store.ts";
import { useI18n } from "../lib/i18n.ts";
import type { AssistanceSettings as Preferences } from "../../../shared/assistance.ts";
import { selectedModel } from "../../../shared/model-options.ts";
import { ModelPicker } from "./ModelPicker.tsx";

export function AssistanceSettings() {
  const t = useI18n();
  const settings = useApp((state) => state.assistance);
  const connected = useApp((state) => state.connected);
  const providers = useApp((state) => state.providers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState(settings);
  useEffect(() => { if (!saving) setDraft(settings); }, [settings, saving]);
  const save = async (patch: Partial<Preferences>) => {
    setSaving(true);
    setError("");
    setDraft((previous) => ({ ...previous, ...patch }));
    try {
      const assistance = await api<Preferences>("providers/assistance", { method: "PATCH", body: JSON.stringify(patch) });
      useApp.setState({ assistance });
    } catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  };
  const selector = (key: "commitModel" | "titleModel" | "reviewModel", label: string) => {
    const value = draft[key];
    const accounts = providers.flatMap(provider => provider.enabled ? [
      ...(provider.available && provider.models.length ? [{ id: `${provider.id}:default`, provider: provider.id, name: provider.label, models: provider.models, instanceId: undefined }] : []),
      ...(provider.instances ?? []).filter(instance => instance.available && instance.models.length).map(instance => ({ id: `${provider.id}:${instance.id}`, provider: provider.id, name: `${provider.label} · ${instance.name}`, models: instance.models, instanceId: instance.id })),
    ] : []);
    return <div className="assistance-model-choice" data-automatic={!value || undefined}>
      <select aria-label={t("{label} account", { label })} value={value ? `${value.provider}:${value.providerInstanceId ?? "default"}` : ""} disabled={!connected || saving} onChange={event => {
        const account = accounts.find(entry => entry.id === event.target.value);
        if (!account) { void save({ [key]: null }); return; }
        const model = selectedModel(account.models, value?.model) ?? selectedModel(account.models);
        if (model) void save({ [key]: { provider: account.provider, providerInstanceId: account.instanceId, model: model.id } });
      }}>
        <option value="">{t("Conversation model")}</option>
        {accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      {value && <ModelPicker label={label} value={value} allowConversation disabled={!connected || saving} lockedProvider={value.provider} instanceId={value.providerInstanceId} onChange={choice => void save({ [key]: choice ? { ...choice, providerInstanceId: choice.provider === value.provider ? value.providerInstanceId : undefined } : null })} />}
    </div>;
  };
  return <>
    <h2 className="settings-group-heading">{t("Conversation titles")}</h2>
    <div className="settings-group">
      <label className="setting-row">
        <span><strong>{t("Automatic titles")}</strong><small>{t("Name new conversations from your first message. Renaming a conversation keeps your chosen title.")}</small></span>
        <input type="checkbox" role="switch" className="setting-switch" checked={draft.automaticTitles} disabled={!connected || saving} onChange={(event) => void save({ automaticTitles: event.target.checked })} />
      </label>
      <div className="setting-row assistance-model-row">
        <span><strong>{t("Title model")}</strong><small>{t("Choose the model that names your conversations.")}</small></span>
        {selector("titleModel", t("Title model"))}
      </div>
    </div>
    <h2 className="settings-group-heading settings-group-spaced">{t("Commit messages")}</h2>
    <div className="settings-group">
      <div className="setting-row assistance-model-row">
        <span><strong>{t("Commit model")}</strong><small>{t("Write commit messages from the selected changes and recent commit subjects.")}</small></span>
        {selector("commitModel", t("Commit model"))}
      </div>
    </div>
    <h2 className="settings-group-heading settings-group-spaced">{t("Code review")}</h2>
    <div className="settings-group"><div className="setting-row assistance-model-row"><span><strong>{t("Review model")}</strong><small>{t("Review changes on demand. Repository guidance can be placed in .citropy/review.md.")}</small></span>{selector("reviewModel", t("Review model"))}</div></div>
    <p className="settings-note">{t("AI assistance uses separate requests on your provider accounts. Reviews and Git actions run when you click them.")}</p>
    {error && <p className="feature-error" role="alert">{error}</p>}
  </>;
}
