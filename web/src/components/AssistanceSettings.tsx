import { useEffect, useState } from "react";
import { api } from "../lib/api.ts";
import { useApp } from "../lib/store.ts";
import type { AssistanceSettings as Preferences } from "../../../shared/assistance.ts";
import { ModelPicker } from "./ModelPicker.tsx";
import { ActionError } from "./ActionError.tsx";

export function AssistanceSettings() {
  const settings = useApp((state) => state.assistance);
  const connected = useApp((state) => state.connected);
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
    const value = draft[key] ?? null;
    return <div className="assistance-model-choice">
      <ModelPicker label={label} value={value} allowConversation automaticLabel="Conversation model" disabled={!connected}
        onChange={choice => void save({ [key]: choice })}
        tune={{ settings: { effort: value?.effort }, only: ["effort"], onChange: patch => { if (value) void save({ [key]: { ...value, effort: patch.effort } }); } }} />
    </div>;
  };
  return <>
    <h2 className="settings-group-heading">Conversation titles</h2>
    <div className="settings-group">
      <label className="setting-row">
        <span><strong>Automatic titles</strong><small>Name new conversations from your first message. Renaming a conversation keeps your chosen title.</small></span>
        <input type="checkbox" role="switch" className="setting-switch" checked={draft.automaticTitles} disabled={!connected} onChange={(event) => void save({ automaticTitles: event.target.checked })} />
      </label>
      <div className="setting-row assistance-model-row">
        <span><strong>Title model</strong><small>Choose the model that names your conversations.</small></span>
        {selector("titleModel", "Title model")}
      </div>
    </div>
    <h2 className="settings-group-heading settings-group-spaced">Commit messages</h2>
    <div className="settings-group">
      <div className="setting-row assistance-model-row">
        <span><strong>Commit model</strong><small>Write commit messages from the selected changes and recent commit subjects.</small></span>
        {selector("commitModel", "Commit model")}
      </div>
    </div>
    <h2 className="settings-group-heading settings-group-spaced">Code review</h2>
    <div className="settings-group"><div className="setting-row assistance-model-row"><span><strong>Review model</strong><small>Review changes on demand. Repository guidance can be placed in .citropy/review.md.</small></span>{selector("reviewModel", "Review model")}</div></div>
    <p className="settings-note">AI assistance uses separate requests on your provider accounts. Reviews and Git actions run when you click them.</p>
    <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
  </>;
}
