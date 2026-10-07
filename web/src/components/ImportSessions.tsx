import { useEffect, useState } from "react";
import { Import, RefreshCw } from "lucide-react";
import { IMPORT_LIST_LIMIT, type ImportableSession, type ImportProvider } from "../../../shared/session-import.ts";
import { api } from "../lib/api.ts";
import { environmentName } from "../lib/environment.ts";
import { selectProject, selectThread, useApp } from "../lib/store.ts";
import { Select } from "./Select.tsx";
import { Modal } from "./Modal.tsx";
import { PixelLoader } from "./PixelLoader.tsx";
import { dateTime, providerLabels } from "../lib/format.ts";
import { PROVIDER_IDS } from "../../../shared/protocol.ts";
import { ActionError } from "./ActionError.tsx";

export function ImportSessions({ onClose }: { onClose: () => void }) {
  const connected = useApp(state => state.connected);
  const [provider, setProvider] = useState<ImportProvider>("claude");
  const [sessions, setSessions] = useState<ImportableSession[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSessions([]);
    setError("");
    void api<ImportableSession[]>(`providers/sessions?provider=${provider}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setSessions(value); })
      .catch(error => { if (!controller.signal.aborted) setError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [provider, refresh]);
  const open = async (session: ImportableSession) => {
    setBusy(session.id);
    setError("");
    try {
      const result = await api<{ threadId: string; projectId: string }>("providers/sessions", { method: "POST", body: JSON.stringify({ id: session.id }) });
      selectProject(result.projectId);
      selectThread(result.threadId);
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(undefined); }
  };
  const filtered = sessions.filter(session => `${session.title} ${session.cwd}`.toLowerCase().includes(query.toLowerCase()));
  return <Modal title="Import conversations" description={`Continue a provider session from ${environmentName()}.`}
    icon={<Import size={20} />} onClose={onClose} busy={Boolean(busy)} className="session-import-dialog"
    footer={<button type="button" className="btn" disabled={Boolean(busy)} onClick={onClose}>Close</button>}>
    <div className="feature-field feature-inline session-import-controls">
      <Select aria-label="Provider" value={provider} disabled={Boolean(busy)} onChange={value => setProvider(value as ImportProvider)}
        options={PROVIDER_IDS.map(id => ({ value: id, label: providerLabels[id] }))} />
      <input aria-label="Find a conversation" placeholder="Find a conversation" value={query} onChange={event => setQuery(event.target.value)} />
      <button type="button" className="icon-btn" aria-label="Refresh" disabled={loading || Boolean(busy)} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} /></button>
    </div>
    <p className="settings-note">{`Choose from the ${IMPORT_LIST_LIMIT} most recent conversations on this machine.`}</p>
    <p className="settings-note">Import messages and tool history, then continue in the original workspace. Attachments are not copied.</p>
    <ActionError className="dialog-error" message={error} onDismiss={() => setError("")} />
    {loading ? <p role="status"><PixelLoader size={16} /> Loading sessions…</p> : <div className="session-import-list">
      {filtered.map(session => <div className="session-import-row" key={session.id}>
        <div><strong>{session.title}</strong><small title={session.cwd}>{session.cwd}</small><small>{dateTime(session.updatedAt)}</small></div>
        <button className="btn" type="button" disabled={!connected || Boolean(busy)} aria-label={`Open ${session.title}`} onClick={() => void open(session)}>
          {busy === session.id ? <PixelLoader size={14} /> : null}{session.importedThreadId ? "Open" : "Import"}
        </button>
      </div>)}
      {!filtered.length && <p className="pane-empty">No matching sessions found on this machine.</p>}
    </div>}
  </Modal>;
}
