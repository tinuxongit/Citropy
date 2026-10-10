import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { BookIcon } from "../BookIcon.tsx";
import { RefreshIcon } from "../icons/rotation.tsx";
import { SearchIcon, TrashIcon } from "../icons/actions.tsx";
import { api } from "../../lib/api.ts";
import { confirmAction, useApp } from "../../lib/store.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import type { SkillInfo } from "../../../../shared/features.ts";
import { PROVIDER_IDS } from "../../../../shared/protocol.ts";
import { providerLabels } from "../../lib/format.ts";
import { Select } from "../Select.tsx";
import { ActionError } from "../ActionError.tsx";
import { SkillCard } from "./SkillCard.tsx";
import { SkillDetails } from "./SkillDetails.tsx";

const source = (skill: SkillInfo) => `${providerLabels[skill.provider]} · ${skill.scope}`;

export function InstalledSkills() {
  const projects = useApp((state) => state.projects);
  const active = useApp((state) => state.activeProjectId);
  const [projectId, setProjectId] = useState(active ?? "");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [openId, setOpenId] = useState("");
  const suffix = projectId ? `?projectId=${projectId}` : "";
  useEffect(() => {
    const controller = new AbortController();
    setBusy("loading");
    setError("");
    api<SkillInfo[]>(`skills${suffix}`, { signal: controller.signal })
      .then(setSkills)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => controller.abort();
  }, [projectId, revision]);
  const change = async (skill: SkillInfo, action: string) => {
    if (
      action === "delete" &&
      !(await confirmAction({
        title: `Delete ${skill.name}?`,
        context: skill.path,
        description: "Remove this installed skill from its provider. Citropy keeps a recovery copy of its instructions in deleted-skills.",
        label: "Delete skill",
        danger: true,
      }))
    )
      return;
    if (action === "delete") setOpenId("");
    setBusy(skill.id);
    setError("");
    try {
      setSkills(
        await api<SkillInfo[]>(`skills${suffix}`, {
          method: "PATCH",
          body: JSON.stringify({ id: skill.id, action }),
        }),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  };
  const filtered = useMemo(() => skills.filter(
    (skill) =>
      skill.scope !== "citropy" &&
      (!provider || skill.provider === provider) &&
      `${skill.name} ${skill.description} ${skill.path}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  ), [skills, provider, query]);
  const opened = skills.find((skill) => skill.id === openId);
  return (
    <>
      <p className="feature-note">
        Skills installed in each provider's own folders. Turning one off or deleting it changes the provider's files, so finish that provider's conversations first. Type @ in a conversation to use an enabled skill.
      </p>
      <div className="feature-filters">
        <label className="feature-search">
          <SearchIcon size={16} />
          <input
            aria-label="Search skills"
            placeholder="Find a skill…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <Select
          aria-label="Filter skills by provider"
          value={provider}
          onChange={setProvider}
          options={[
            { value: "", label: "All providers" },
            ...PROVIDER_IDS.map((id) => ({ value: id, label: providerLabels[id] })),
          ]}
        />
        <button
          className="icon-btn"
          aria-label="Refresh skills"
          disabled={Boolean(busy)}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshIcon size={17} />
        </button>
      </div>
      <label className="feature-field">
        Project skills from
        <Select
          disabled={Boolean(busy)}
          value={projectId}
          onChange={(value) => {
            setProjectId(value);
            setOpenId("");
          }}
          options={[
            { value: "", label: "No project, personal and plugin skills only" },
            ...projects.map((project) => ({ value: project.id, label: project.name })),
          ]}
        />
      </label>
      <p className="feature-note" role="status">
        {filtered.filter((skill) => skill.enabled).length} of {filtered.length} enabled
      </p>
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      <div className="skill-grid">
        {filtered.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            icon={<ProviderIcon provider={skill.provider} />}
            source={source(skill)}
            busy={Boolean(busy)}
            onToggle={() => void change(skill, skill.enabled ? "disable" : "enable")}
            onOpen={() => setOpenId(skill.id)}
          />
        ))}
      </div>
      {!filtered.length && (
        <div className="pane-empty">
          <BookIcon size={28} />
          <p>
            {busy === "loading"
              ? "Reading installed skills…"
              : query
                ? "No matching skills."
                : "No skills found in these locations."}
          </p>
        </div>
      )}
      <AnimatePresence>{opened && (
        <SkillDetails
          skill={opened}
          icon={<ProviderIcon provider={opened.provider} />}
          source={source(opened)}
          projectId={projectId}
          onClose={() => setOpenId("")}
          actions={
            <button className="btn dialog-footer-start" data-variant="ghost" type="button" disabled={Boolean(busy)} onClick={() => void change(opened, "delete")}>
              <TrashIcon size={15} />
              Delete
            </button>
          }
        />
      )}</AnimatePresence>
    </>
  );
}
