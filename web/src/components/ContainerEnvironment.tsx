import { useState } from "react";
import { BoxIcon } from "./icons/hardware.tsx";
import { FolderOpenIcon } from "./icons/folders.tsx";
import { Modal } from "./Modal.tsx";
import { selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { send } from "../lib/socket.ts";
import type { SshConnection } from "../../../shared/environments.ts";
import { Loader } from "./Loader.tsx";
import { ActionError } from "./ActionError.tsx";

export function ContainerEnvironment({ onClose, connection }: { onClose: () => void; connection?: SshConnection }) {
  const [name, setName] = useState(connection?.name ?? "");
  const [path, setPath] = useState(connection?.target ?? "");
  const [id, setId] = useState(connection?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = useEnvironments();
  const desktop = window.citropyDesktop;
  const connect = async () => {
    if (!desktop) return;
    setBusy(true);
    setError("");
    try {
      const saved = await desktop.saveEnvironment({ id, kind: "container", name: name.trim(), target: path, port: 0, node: "node" });
      setId(saved.id);
      await selectEnvironment(saved.id);
      send({ t: "project.choose", path: "/workspace" });
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title="Container workspace" icon={<BoxIcon size={20} />} description="Run providers and shells in a Linux container using Docker." busy={busy} onClose={onClose} onSubmit={() => void connect()} footer={<>
    <button className="btn" type="button" data-cancel disabled={busy && !id} onClick={() => { if (busy && id) void desktop?.disconnectEnvironment(id).catch(error => setError(error.message)); else onClose(); }}>{busy ? "Cancel connection" : "Cancel"}</button>
    <button className="btn" data-variant="primary" type="submit" disabled={busy || !path || !name.trim()}>{busy && <Loader size={14} />}{id ? "Reconnect" : "Create and connect"}</button>
  </>}>
    <label className="feature-field">Environment name<input required maxLength={80} value={name} disabled={busy} onChange={event => setName(event.target.value)} placeholder="Container development" /></label>
    <label className="feature-field">Mounted folder<div className="feature-inline"><input readOnly value={path} placeholder="Choose a folder" /><button className="btn" type="button" disabled={busy || Boolean(id)} onClick={() => void desktop?.chooseWorkspaceFolder("local", path).then(value => { if (typeof value === "string" && value) { setPath(value); if (!name) setName(value.split(/[\\/]/).filter(Boolean).at(-1) ?? "Container"); } }).catch(error => setError(error.message))}><FolderOpenIcon size={15} />Browse</button></div></label>
    <p className="settings-note">Includes Node, Git, Python and OpenCode. Changes under /workspace change this folder on your computer. Provider sign-ins and task history are stored separately for this environment.</p>
    <p className="settings-note">Docker must be running. The first connection builds the image and can take several minutes. Disconnecting leaves its tasks and shells running.</p>
    {busy && <p className="ssh-progress" role="status"><Loader size={14} />{state.connections.find(entry => entry.id === id)?.message ?? "Connecting…"}</p>}
    <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
  </Modal>;
}
