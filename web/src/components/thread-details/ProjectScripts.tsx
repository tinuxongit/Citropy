import { useState, type FormEvent } from "react";
import { AnimatePresence } from "motion/react";
import { EditIcon } from "../icons/pencil.tsx";
import { PlayIcon } from "../icons/media.tsx";
import { TerminalIcon } from "../icons/squares.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import { Modal } from "../Modal.tsx";
import { DetailActionRow, DetailSection } from "./DetailRow.tsx";
import { runProjectScript, saveProjectScripts } from "../../lib/actions.ts";
import { randomId } from "../../lib/random-id.ts";
import { PROJECT_SCRIPT_LIMITS } from "../../../../shared/project-scripts.ts";
import type { Project, ProjectScript } from "../../../../shared/protocol.ts";

export function ProjectScripts({ project, threadId, disabled }: { project: Project; threadId: string; disabled: boolean }) {
  const scripts = project.scripts ?? [];
  const [editing, setEditing] = useState<ProjectScript>();
  return <>
    <DetailSection icon={<TerminalIcon size={16} />} title="Scripts" addLabel="Add project script" addDisabled={scripts.length >= PROJECT_SCRIPT_LIMITS.count} onAdd={() => setEditing({ id: randomId(), name: "", command: "" })}>
      {scripts.map((script) => (
        <DetailActionRow key={script.id} icon={<PlayIcon size={14} />} label={script.name} title={script.command} disabled={disabled} onClick={() => runProjectScript(project.id, threadId, script.id)} actionLabel={`Edit ${script.name}`} actionIcon={<EditIcon size={13} />} onAction={() => setEditing(script)} />
      ))}
    </DetailSection>
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
    <Modal className="script-editor" title={existing ? "Edit project script" : "Add project script"} description="Runs in a new terminal in this conversation's workspace." icon={<TerminalIcon size={18} />} initialFocus="input" onClose={onClose} onSubmit={submit}
      footer={<>
        {existing && <button type="button" className="btn" data-variant="danger" onClick={() => onSave(scripts.filter((entry) => entry.id !== script.id))}><TrashIcon size={14} />Delete</button>}
        <button type="button" className="btn" data-cancel onClick={onClose}>Cancel</button>
        <button className="btn" data-variant="primary" disabled={!name.trim() || !command.trim()}>Save</button>
      </>}>
      <label className="feature-field">Name<input type="text" value={name} maxLength={PROJECT_SCRIPT_LIMITS.name} placeholder="Dev server" onChange={(event) => setName(event.target.value)} /></label>
      <label className="feature-field">Command<input type="text" value={command} maxLength={PROJECT_SCRIPT_LIMITS.command} className="script-command" placeholder="npm run dev" spellCheck={false} onChange={(event) => setCommand(event.target.value)} /></label>
    </Modal>
  );
}
