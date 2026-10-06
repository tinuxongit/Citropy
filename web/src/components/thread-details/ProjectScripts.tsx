import { useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { Pencil, Play, Plus, Trash2 } from "lucide-react";
import { Modal } from "../Modal.tsx";
import type { MenuItem } from "../Menu.tsx";
import { DetailRow, DetailSplitRow } from "./DetailRow.tsx";
import { runProjectScript, saveProjectScripts } from "../../lib/actions.ts";
import { randomId } from "../../lib/random-id.ts";
import { PROJECT_SCRIPT_LIMITS } from "../../../../shared/project-scripts.ts";
import type { Project, ProjectScript } from "../../../../shared/protocol.ts";

const lastScriptKey = (projectId: string) => `citropy.lastScript.${projectId}`;

export function ProjectScripts({ project, threadId, disabled }: { project: Project; threadId: string; disabled: boolean }) {
  const scripts = project.scripts ?? [];
  const [editing, setEditing] = useState<ProjectScript>();
  const [lastId, setLastId] = useState(() => localStorage.getItem(lastScriptKey(project.id)));
  const primary = scripts.find((script) => script.id === lastId) ?? scripts[0];
  const run = (script: ProjectScript) => {
    localStorage.setItem(lastScriptKey(project.id), script.id);
    setLastId(script.id);
    runProjectScript(project.id, threadId, script.id);
  };
  const full = scripts.length >= PROJECT_SCRIPT_LIMITS.count;
  const add = () => setEditing({ id: randomId(), name: "", command: "" });
  const menu: MenuItem[] = [
    ...scripts.map((script) => ({
      id: script.id,
      label: script.name,
      hint: script.command,
      icon: <Play size={14} />,
      disabled,
      onSelect: () => run(script),
      action: { label: `Edit ${script.name}`, icon: <Pencil size={13} />, onSelect: () => setEditing(script) },
    })),
    { id: "add", label: "Add script", icon: <Plus size={14} />, section: "Manage", disabled: full, onSelect: add },
  ];
  return <>
    {primary
      ? <DetailSplitRow icon={<Play size={16} />} label={`Run ${primary.name}`} title={primary.command} disabled={disabled} onClick={() => run(primary)} menu={menu} menuLabel="Project scripts" />
      : <DetailRow icon={<Plus size={16} />} label="Add project script" onClick={add} />}
    <AnimatePresence>{editing && <ScriptEditor script={editing} scripts={scripts} onClose={() => setEditing(undefined)} onSave={(next) => { saveProjectScripts(project.id, next); setEditing(undefined); }} />}</AnimatePresence>
  </>;
}

function ScriptEditor({ script, scripts, onClose, onSave }: { script: ProjectScript; scripts: ProjectScript[]; onClose: () => void; onSave: (scripts: ProjectScript[]) => void }) {
  const [name, setName] = useState(script.name);
  const [command, setCommand] = useState(script.command);
  const existing = scripts.some((entry) => entry.id === script.id);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = { id: script.id, name: name.trim(), command: command.trim() };
    onSave(existing ? scripts.map((entry) => entry.id === script.id ? next : entry) : [...scripts, next]);
  };
  return (
    <Modal className="script-editor" title={existing ? "Edit project script" : "Add project script"} description="Runs in a new terminal in this conversation's workspace." initialFocus="input" onClose={onClose} onSubmit={submit}
      footer={<>
        {existing && <button type="button" className="btn" data-variant="danger" onClick={() => onSave(scripts.filter((entry) => entry.id !== script.id))}><Trash2 size={14} />Delete</button>}
        <button type="button" className="btn" data-cancel onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={!name.trim() || !command.trim()}>Save</button>
      </>}>
      <label className="feature-field">Name<input type="text" value={name} maxLength={PROJECT_SCRIPT_LIMITS.name} placeholder="Dev server" onChange={(event) => setName(event.target.value)} /></label>
      <label className="feature-field">Command<input type="text" value={command} maxLength={PROJECT_SCRIPT_LIMITS.command} placeholder="npm run dev" spellCheck={false} onChange={(event) => setCommand(event.target.value)} /></label>
    </Modal>
  );
}
