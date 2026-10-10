import type { SshConnection } from "../../../shared/environments.ts";
import { useEffect, useId, useState } from "react";
import { AnimatePresence } from "motion/react";
import { BoxIcon, MonitorIcon } from "./icons/hardware.tsx";
import type { MenuItem } from "./Menu.tsx";
import { EnvironmentRow, type RowState } from "./environments/EnvironmentRow.tsx";
import { connectionAddress, connectionStatus, type Connection } from "./environments/environment-status.ts";
import { ServerIcon } from "./ServerIcon.tsx";
import { ContainerEnvironment } from "./ContainerEnvironment.tsx";
import { Modal } from "./Modal.tsx";
import { selectEnvironment, useEnvironments } from "../lib/environment.ts";
import { confirmAction } from "../lib/store.ts";
import { Loader } from "./Loader.tsx";
import { ActionError } from "./ActionError.tsx";

export function NewSshConnection({ onClose, connection }: { onClose: () => void; connection?: SshConnection }) {
  const id = useId();
  const [name, setName] = useState(connection?.name || "");
  const [target, setTarget] = useState(connection?.target || "");
  const [port, setPort] = useState(connection?.port ? String(connection.port) : "");
  const [node, setNode] = useState(connection?.node || "node");
  const [hosts, setHosts] = useState<string[]>([]);
  const [savedId, setSavedId] = useState<string | undefined>(connection?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const state = useEnvironments();
  const progress = state.connections.find(entry => entry.id === savedId);
  useEffect(() => { let disposed = false; void window.citropyDesktop?.sshHosts().then(value => { if (!disposed) setHosts(value); }, (error: Error) => { if (!disposed) setError(error.message); }); return () => { disposed = true; }; }, []);
  const connect = async () => {
    const desktop = window.citropyDesktop;
    if (!desktop) return;
    setBusy(true);
    setError("");
    try {
      const connectionId = (await desktop.saveEnvironment({ id: savedId, name: name.trim() || target.trim(), target, port: Number(port), node })).id;
      setSavedId(connectionId);
      await selectEnvironment(connectionId);
      onClose();
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title="Connect over SSH" description="Work with files, Git, providers, and shells on another machine." icon={<ServerIcon size={20} />} initialFocus="input" busy={busy} onClose={onClose} onSubmit={() => void connect()} footer={<>
    <button className="btn" type="button" data-cancel onClick={() => { if (busy && savedId) void window.citropyDesktop?.disconnectEnvironment(savedId).catch(error => setError(error.message)); else onClose(); }} disabled={busy && !savedId}>{busy ? "Cancel connection" : "Cancel"}</button>
    <button className="btn" data-variant="primary" type="submit" disabled={busy || !target.trim()}>{busy && <Loader size={14} />}{savedId ? "Reconnect" : "Connect"}</button>
  </>}>
    <div className="ssh-form feature-field">
      <label htmlFor={`${id}-target`}>SSH host</label>
      <input id={`${id}-target`} value={target} onChange={event => setTarget(event.target.value)} list={`${id}-hosts`} placeholder="user@hostname" autoComplete="off" spellCheck={false} required disabled={busy || Boolean(savedId)} />
      <datalist id={`${id}-hosts`}>{hosts.map(host => <option key={host} value={host} />)}</datalist>
      <label htmlFor={`${id}-name`}>Connection name</label>
      <input id={`${id}-name`} value={name} onChange={event => setName(event.target.value)} placeholder="Optional" maxLength={80} disabled={busy} />
      <details><summary>SSH options</summary><div className="ssh-options">
        <label htmlFor={`${id}-port`}>Port</label><input id={`${id}-port`} type="number" min={1} max={65535} placeholder="SSH config" value={port} onChange={event => setPort(event.target.value)} disabled={busy || Boolean(savedId)} />
        <label htmlFor={`${id}-node`}>Remote Node path</label><input id={`${id}-node`} value={node} onChange={event => setNode(event.target.value)} disabled={busy} spellCheck={false} />
      </div></details>
      <p className="settings-note">Uses your SSH config, keys, and agent. Connect once in a terminal to trust a new host. Citropy sets up Node.js and its backend under your remote account when needed, without sudo.</p>
      <p className="settings-note">Use providers installed and signed in on the remote host. Desktop browser tools are available in Local only.</p>
      {busy && <p className="ssh-progress" role="status"><Loader size={14} />{progress?.message || "Connecting…"}</p>}
      <ActionError className="ssh-error" message={error} onDismiss={() => setError("")} />
    </div>
  </Modal>;
}

export function EnvironmentSettings() {
  const state = useEnvironments();
  const [adding, setAdding] = useState(false);
  const [container, setContainer] = useState(false);
  const [editing, setEditing] = useState<SshConnection>();
  const [error, setError] = useState("");
  const desktop = window.citropyDesktop;
  const run = async (operation: () => Promise<unknown>) => { setError(""); try { await operation(); } catch (error) { setError((error as Error).message); } };
  const connecting = state.connections.some(entry => entry.status === "connecting");
  const use = (id: string) => void run(() => selectEnvironment(id));
  const rowState = (connection: Connection): RowState => {
    if (connection.status === "connecting") return "connecting";
    if (connection.status === "connected" && connection.id === state.activeId) return "in-use";
    return connection.status === "error" ? "error" : "idle";
  };
  const menu = (connection: Connection): MenuItem[] => {
    const busy = connection.status === "connecting";
    const active = connection.id === state.activeId;
    return [
      { id: "edit", label: "Edit…", disabled: busy || connection.status === "connected", hint: connection.status === "connected" ? "Disconnect first" : undefined, onSelect: () => setEditing(connection) },
      { id: "disconnect", label: "Disconnect", disabled: connection.status !== "connected", onSelect: () => void run(() => desktop!.disconnectEnvironment(connection.id)) },
      ...(connection.kind === "container" ? [{ id: "stop", label: "Stop container", disabled: busy, onSelect: () => void run(async () => { if (await confirmAction({ title: "Stop container?", description: "Running tasks and shells in this container will stop. Files and task history are preserved.", label: "Stop container", danger: true })) await desktop!.stopEnvironment(connection.id); }) }] : []),
      { id: "remove", label: "Remove", danger: true, disabled: active || busy, hint: active ? "Switch away first" : undefined, onSelect: () => void run(async () => { if (await confirmAction({ title: "Remove connection?", description: connection.kind === "container" ? "This stops the container and removes the connection. Your mounted folder and saved history stay on disk." : "This removes the saved connection. Remote files and tasks stay on the host.", label: "Remove", danger: true })) await desktop!.removeEnvironment(connection.id); }) },
    ];
  };
  return <div className="environment-settings">
    <div className="settings-group environment-list">
      <EnvironmentRow icon={<MonitorIcon size={18} />} name="Local" detail="This computer" status="Always available"
        state={state.activeId === "local" ? "in-use" : "idle"}
        action={{ label: "Use", disabled: !desktop?.connectEnvironment, onClick: () => use("local") }} />
      {state.connections.map(connection => <EnvironmentRow key={connection.id}
        icon={connection.kind === "container" ? <BoxIcon size={18} /> : <ServerIcon size={18} />}
        name={connection.name} detail={connectionAddress(connection)} status={connectionStatus(connection)}
        state={rowState(connection)} menu={desktop ? menu(connection) : undefined}
        action={connection.status === "connecting"
          ? { label: "Cancel", onClick: () => void run(() => desktop!.disconnectEnvironment(connection.id)) }
          : { label: connection.id === state.activeId ? "Reconnect" : "Use", disabled: connecting || !desktop?.connectEnvironment, onClick: () => use(connection.id) }} />)}
    </div>
    <div className="environment-add">
      <button className="btn" onClick={() => setAdding(true)} disabled={!desktop?.saveEnvironment}><ServerIcon size={14} />Add SSH server</button>
      <button className="btn" onClick={() => setContainer(true)} disabled={!desktop?.saveEnvironment}><BoxIcon size={14} />Add container</button>
    </div>
    <p className="settings-note">{desktop?.saveEnvironment
      ? "Each environment keeps its own projects and conversations. Disconnecting leaves tasks and shells running on the other machine."
      : "SSH servers and containers need the Citropy desktop app."}</p>
    <ActionError className="ssh-error" message={error} onDismiss={() => setError("")} />
    <AnimatePresence>{(container || editing?.kind === "container") && <ContainerEnvironment connection={editing} onClose={() => { setContainer(false); setEditing(undefined); }} />}{(adding || editing && editing.kind !== "container") && <NewSshConnection connection={editing} onClose={() => { setAdding(false); setEditing(undefined); }} />}</AnimatePresence>
  </div>;
}

export function RemoteConnectionBanner() {
  const state = useEnvironments();
  const [error, setError] = useState("");
  const connection = state.connections.find(entry => entry.status === "connecting") || state.connections.find(entry => entry.id === state.activeId);
  if (!connection || connection.status === "connected") return null;
  const run = async (id: string) => { setError(""); try { await selectEnvironment(id); } catch (error) { setError((error as Error).message); } };
  return <div className="remote-connection-banner" role="status"><ServerIcon size={15} /><span>{connection.name}: {connection.message || "Disconnected"}{error && <span className="ssh-error"> {error}</span>}</span>
    {connection.status === "connecting" ? <button className="btn" onClick={() => void window.citropyDesktop?.disconnectEnvironment(connection.id)}>Cancel connection</button> : <button className="btn" onClick={() => void run(connection.id)}>Reconnect</button>}
    <button className="btn" onClick={() => void run("local")}>Switch to Local</button>
  </div>;
}
