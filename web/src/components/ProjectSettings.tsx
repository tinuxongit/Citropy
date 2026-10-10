import { AnimatePresence } from "motion/react";
import { useRef, useState } from "react";
import { resolveProjectSettings } from "../../../shared/project-settings.ts";
import type { FolderSettings, ProjectSettings as Preferences } from "../../../shared/protocol.ts";
import { saveProjectDefaults } from "../lib/actions.ts";
import { useApp } from "../lib/store.ts";
import { ActionError } from "./ActionError.tsx";
import { FolderIcon } from "./icons/folders.tsx";
import { ProjectDialog } from "./projects/ProjectDialog.tsx";
import { ProjectOptionRows } from "./projects/ProjectOptionRows.tsx";
import { projectSummary } from "./projects/project-summary.ts";
import { SettingsCard } from "./SettingsCard.tsx";

export function ProjectSettings() {
  const projects = useApp((state) => state.projects);
  const providers = useApp((state) => state.providers);
  const [openId, setOpenId] = useState("");
  const opened = projects.find((project) => project.id === openId);
  return (
    <>
      <h2 className="settings-group-heading">Defaults for new chats</h2>
      <DefaultsGroup />
      <h2 className="settings-group-heading">Projects</h2>
      <p className="settings-note project-list-note">Click a project to change its name or give it its own settings. Anything you leave alone follows your defaults.</p>
      {projects.length > 0 ? (
        <div className="settings-card-grid">
          {projects.map((project) => (
            <SettingsCard key={project.id}
              title={project.name}
              subtitle={project.path}
              description={projectSummary(project.settings ?? {}, providers)}
              icon={<FolderIcon size={20} />}
              onOpen={() => setOpenId(project.id)} />
          ))}
        </div>
      ) : <p className="settings-note">Folders you open show up here.</p>}
      <AnimatePresence>{opened && <ProjectDialog key={opened.id} project={opened} onClose={() => setOpenId("")} />}</AnimatePresence>
    </>
  );
}

function DefaultsGroup() {
  const defaults = useApp((state) => state.projectDefaults);
  const [draft, setDraft] = useState<Preferences>();
  const revision = useRef(0);
  const [error, setError] = useState("");
  const settings = draft ?? defaults;
  const update = async (patch: FolderSettings) => {
    const next = { ...settings, ...patch };
    const requested = ++revision.current;
    setDraft(next);
    setError("");
    try {
      await saveProjectDefaults(next);
      if (revision.current === requested) setDraft(undefined);
    } catch (cause) {
      if (revision.current !== requested) return;
      setDraft(undefined);
      setError((cause as Error).message);
    }
  };
  return <>
    <div className="settings-group">
      <ProjectOptionRows settings={resolveProjectSettings(settings)} update={(patch) => void update(patch)} />
    </div>
    <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
  </>;
}
