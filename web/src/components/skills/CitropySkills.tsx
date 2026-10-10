import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { BookIcon } from "../BookIcon.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { TrashIcon } from "../icons/actions.tsx";
import { api } from "../../lib/api.ts";
import { confirmAction } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { CitropySkillForm } from "./CitropySkillForm.tsx";
import { SettingsCard } from "../SettingsCard.tsx";
import { skillDescription } from "./skill-description.ts";
import { SkillDetails } from "./SkillDetails.tsx";
import type { CitropySkillDraft, SkillInfo } from "../../../../shared/features.ts";

const SOURCE = "Citropy · every provider";
const MARK = <span className="citropy-mark" aria-hidden="true" />;

export function CitropySkills() {
  const [skills, setSkills] = useState<SkillInfo[]>();
  const [editing, setEditing] = useState<SkillInfo | "new">();
  const [openId, setOpenId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    api<SkillInfo[]>("skills", { signal: controller.signal })
      .then(setSkills)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, []);
  const citropySkills = useMemo(() => {
    const byPath = new Map<string, SkillInfo>();
    for (const skill of skills ?? []) if (skill.scope === "citropy" && !byPath.has(skill.path)) byPath.set(skill.path, skill);
    return [...byPath.values()];
  }, [skills]);
  const perform = async (path: string, method: string, input: object) => {
    setBusy(true);
    setError("");
    try {
      setSkills(await api<SkillInfo[]>(path, { method, body: JSON.stringify(input) }));
      return true;
    } catch (error) {
      setError((error as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async (draft: CitropySkillDraft) => {
    if (await perform("skills/citropy", "PUT", { id: editing === "new" ? undefined : editing?.id, ...draft })) setEditing(undefined);
  };
  const remove = async (skill: SkillInfo) => {
    if (await confirmAction({
      title: `Delete ${skill.name}?`,
      description: "Agents stop using this skill. Citropy keeps a recovery copy in deleted-skills.",
      label: "Delete skill",
      danger: true,
    })) {
      setOpenId("");
      await perform("skills", "PATCH", { id: skill.id, action: "delete" });
    }
  };
  const opened = citropySkills.find((skill) => skill.id === openId);
  return (
    <>
      <p className="feature-note">
        Citropy skills work with Claude Code, Codex, and OpenCode in every project. Agents see each skill's name and when to use it, and open the full instructions when a task matches.
      </p>
      {editing ? (
        <CitropySkillForm
          skill={editing === "new" ? undefined : editing}
          busy={busy}
          onSave={(draft) => void save(draft)}
          onCancel={() => setEditing(undefined)}
          onError={setError}
        />
      ) : (
        <div className="feature-save">
          <button className="btn" data-variant="primary" disabled={!skills} onClick={() => setEditing("new")}>
            <PlusIcon size={15} />
            New skill
          </button>
        </div>
      )}
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      <div className="settings-card-grid">
        {citropySkills.map((skill) => (
          <SettingsCard
            key={skill.path}
            title={skill.name}
            subtitle={SOURCE}
            description={skillDescription(skill)}
            icon={MARK}
            toggle={{
              checked: skill.enabled,
              label: `Enable ${skill.name}, ${SOURCE}`,
              busy,
              onChange: () => void perform("skills", "PATCH", { id: skill.id, action: skill.enabled ? "disable" : "enable" }),
            }}
            onOpen={() => setOpenId(skill.id)}
          />
        ))}
      </div>
      {skills && !citropySkills.length && !editing && (
        <div className="pane-empty">
          <BookIcon size={28} />
          <p>No Citropy skills yet.</p>
        </div>
      )}
      <AnimatePresence>{opened && (
        <SkillDetails
          skill={opened}
          icon={MARK}
          source={SOURCE}
          onClose={() => setOpenId("")}
          actions={<>
            <button className="btn dialog-footer-start" data-variant="ghost" type="button" disabled={busy} onClick={() => void remove(opened)}>
              <TrashIcon size={15} />
              Delete
            </button>
            <button className="btn" type="button" disabled={busy} onClick={() => { setOpenId(""); setEditing(opened); }}>Edit</button>
          </>}
        />
      )}</AnimatePresence>
    </>
  );
}
