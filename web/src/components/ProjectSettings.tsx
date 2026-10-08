import { useRef, useState } from "react";
import { ChevronDown, Globe2, Save } from "lucide-react";
import { FolderIcon } from "./FolderIcon.tsx";
import { api } from "../lib/api.ts";
import { useApp } from "../lib/store.ts";
import { saveProjectDefaults } from "../lib/actions.ts";
import { resolveProjectSettings } from "../../../shared/project-settings.ts";
import { selectedModel } from "../../../shared/model-options.ts";
import type { Project, ProjectSettings as Preferences } from "../../../shared/protocol.ts";
import { Select } from "./Select.tsx";
import { Menu } from "./Menu.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { ActionError } from "./ActionError.tsx";

export function ProjectSettings() {
  const projects = useApp((state) => state.projects);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const [selected, setSelected] = useState(activeProjectId ?? projects[0]?.id);
  const project = projects.find((entry) => entry.id === selected) ?? projects[0];
  return (
    <div className="feature-stack project-settings">
      <GlobalDefaultsForm />
      <section className="project-folder-section" aria-labelledby="folder-configuration-heading">
        <div className="project-scope-heading">
          <FolderIcon size={19} />
          <div>
            <h2 id="folder-configuration-heading">Folder configuration</h2>
            <p className="feature-note">Override global defaults for a folder.</p>
          </div>
        </div>
        {project ? <>
          <Menu
            width={400}
            searchable
            searchPlaceholder="Find a workspace"
            items={projects.map((entry) => ({
              id: entry.id, label: entry.name, hint: entry.path,
              icon: <FolderIcon size={17} />, selected: entry.id === project.id,
              onSelect: () => setSelected(entry.id),
            }))}
            trigger={({ id, toggle, open }) => <button
              id={id} type="button" className="project-folder-picker"
              aria-label={`Configure folder: ${project.name}`}
              aria-haspopup="menu" aria-expanded={open} onClick={toggle}
            >
              <FolderIcon size={18} />
              <span><strong>{project.name}</strong><small>{project.path}</small></span>
              <ChevronDown size={15} />
            </button>}
          />
          <ProjectForm key={project.id} project={project} />
        </> : <p className="feature-note">Open a folder to add overrides. Global defaults apply to every folder you open.</p>}
      </section>
    </div>
  );
}

function GlobalDefaultsForm() {
  const defaults = useApp((state) => state.projectDefaults);
  const [draft, setDraft] = useState<Preferences>();
  const settings = draft ?? defaults;
  const [saved, setSaved] = useState(false);
  const revision = useRef(0);
  const [error, setError] = useState("");
  const save = async () => {
    const requested = revision.current;
    setError("");
    try {
      await saveProjectDefaults(settings);
      if (revision.current !== requested) return;
      setDraft(undefined);
      setSaved(true);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return <section className="settings-group project-scope" aria-labelledby="global-project-defaults-heading">
    <div className="project-scope-heading">
      <Globe2 size={19} />
      <div>
        <h2 id="global-project-defaults-heading">Global defaults</h2>
        <p className="feature-note">Shared by Local and SSH folders, unless a folder overrides them.</p>
      </div>
    </div>
    <DefaultsFields settings={settings} update={(patch) => {
      revision.current++;
      setDraft((previous) => ({ ...(previous ?? defaults), ...patch }));
      setSaved(false);
    }} />
    <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
    <div className="feature-save">
      <span role="status">{saved ? "Global defaults saved" : ""}</span>
      <button className="btn" data-variant="primary" onClick={save}>
        <Save size={15} />Save global defaults
      </button>
    </div>
  </section>;
}

function DefaultsFields({ settings, globalDefaults, update }: {
  settings: Preferences;
  globalDefaults?: Preferences;
  update: (patch: Partial<Preferences>) => void;
}) {
  const providers = useApp((state) => state.providers);
  const folder = globalDefaults !== undefined;
  const inheritedModel = folder && settings.provider === undefined;
  const effective = folder ? resolveProjectSettings(globalDefaults, settings) : resolveProjectSettings(settings);
  const global = resolveProjectSettings(globalDefaults);
  const provider = providers.find((entry) => entry.id === effective.provider);
  const model = selectedModel(provider?.models ?? [], effective.model);
  const permissions = [
    { value: "manual", label: "Ask before changes" },
    { value: "acceptEdits", label: "Auto edits" },
    { value: "plan", label: "Plan only" },
    { value: "bypass", label: "Full access" },
  ];
  return <fieldset className="project-defaults-fields">
    <p className="feature-note">Model, effort, permissions, and workspace apply to new conversations.</p>
    {folder && <label className="project-inherit-model">
      <input type="checkbox" checked={inheritedModel} onChange={(event) => update(event.target.checked
        ? { provider: undefined, model: undefined, effort: undefined }
        : { provider: global.provider ?? null, model: global.model, effort: global.effort })} />
      Use global model and effort
    </label>}
    <div className="feature-form-grid">
      <div className="feature-field">
        <span>Model</span>
        <ModelPicker
          label="Default model"
          defaultOnly
          value={effective.provider ? { provider: effective.provider, model: effective.model ?? "" } : null}
          automaticLabel="Use the last selected model"
          disabled={inheritedModel}
          onChange={(choice) => update({ provider: choice?.provider ?? null, model: choice?.model, effort: undefined })}
          tune={{ settings: { effort: effective.effort }, only: ["effort"], onChange: (patch) => update({ model: model?.id, effort: patch.effort }) }}
        />
      </div>
      <label className="feature-field">
        Permissions
        <Select value={folder ? settings.permissionMode ?? "" : effective.permissionMode}
          onChange={(value) => update({ permissionMode: value as Preferences["permissionMode"] || undefined })}
          options={[
            ...folder ? [{ value: "", label: `Use global: ${permissions.find((entry) => entry.value === global.permissionMode)!.label}` }] : [],
            ...permissions.map((entry) => ({ value: entry.value, label: entry.label })),
          ]} />
      </label>
      <label className="feature-field">
        Workspace
        <Select value={folder ? settings.workspace ?? "" : effective.workspace}
          onChange={(value) => update({ workspace: value as Preferences["workspace"] || undefined })}
          options={[
            ...folder ? [{ value: "", label: `Use global: ${global.workspace === "new" ? "New worktree" : "Current folder"}` }] : [],
            { value: "current", label: "Current folder" },
            { value: "new", label: "New worktree" },
          ]} />
      </label>
    </div>
    {([
      { key: "autoPull", label: "Pull before starting", description: "Fast-forward a clean checkout when it has no local commits." },
      ...folder ? [{ key: "browserAccess", label: "Provider browser access", description: "Allow conversations to use the shared browser tools." }] as const : [],
    ] as const).map(({ key, label, description }) => <label className="feature-setting-row" key={key}>
      <span><strong>{label}</strong><small>{description}</small></span>
      {folder ? <Select className="project-policy-select" value={settings[key] === undefined ? "inherit" : String(settings[key])}
        onChange={(value) => update({ [key]: value === "inherit" ? undefined : value === "true" })}
        options={[
          { value: "inherit", label: `Use global: ${global[key] ? "Enabled" : "Disabled"}` },
          { value: "true", label: "Enabled" },
          { value: "false", label: "Disabled" },
        ]} /> : <input className="setting-switch" type="checkbox" role="switch" checked={Boolean(effective[key])}
        onChange={(event) => update({ [key]: event.target.checked })} />}
    </label>)}
  </fieldset>;
}

function ProjectForm({ project }: { project: Project }) {
  const globalDefaults = useApp((state) => state.projectDefaults);
  const [name, setName] = useState(project.name);
  const [settings, setSettings] = useState<Preferences>(project.settings ?? {});
  const [saved, setSaved] = useState(false);
  const revision = useRef(0);
  const [error, setError] = useState("");
  const update = (patch: Partial<Preferences>) => {
    revision.current++;
    setSettings((previous) => ({ ...previous, ...patch }));
    setSaved(false);
  };
  const save = async () => {
    const requested = revision.current;
    setError("");
    try {
      const result = await api<Project>(`projects?projectId=${project.id}`, {
        method: "PATCH", body: JSON.stringify({ name, settings }),
      });
      if (revision.current !== requested) return;
      setSettings(result.settings ?? {});
      setName(result.name);
      setSaved(true);
    } catch (error) {
      setError((error as Error).message);
    }
  };
  return <div className="feature-stack">
    <section className="settings-group project-scope" aria-label="Folder defaults">
      <label className="feature-field project-name-field">
        Project name
        <input value={name} onChange={(event) => { revision.current++; setName(event.target.value); setSaved(false); }} />
      </label>
      <DefaultsFields settings={settings} globalDefaults={globalDefaults} update={update} />
    </section>
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      <div className="feature-save">
        <span role="status">{saved ? "Folder settings saved" : ""}</span>
        <button
          className="btn"
          data-variant="primary"
          onClick={save}
        >
          <Save size={15} />
          Save folder settings
        </button>
      </div>
  </div>;
}
