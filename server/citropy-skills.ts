import { mkdir, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { citropySkillsRoot } from "./paths.ts";
import { forgetSkillInventory, frontmatterField, listSkills, MAX_SKILL_BYTES, readSkillFile, skillInstructions } from "./skills.ts";
import { CITROPY_SKILL_LIMITS, type CitropySkillDraft, type SkillInfo } from "../shared/features.ts";

const NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function findCitropySkill(id: string): Promise<SkillInfo> {
  const skill = (await listSkills()).find((entry) => entry.id === id && entry.scope === "citropy");
  if (!skill) throw new Error("This skill is no longer installed. Refresh the list.");
  return skill;
}

export async function readCitropySkill(id: string): Promise<CitropySkillDraft> {
  const skill = await findCitropySkill(id);
  const content = await readSkillFile(skill.path);
  return {
    name: skill.name,
    description: frontmatterField(content, "description"),
    instructions: skillInstructions(content),
  };
}

function skillDocument({ name, description, instructions }: CitropySkillDraft): string {
  if (typeof name !== "string" || !NAME_PATTERN.test(name) || name.length > CITROPY_SKILL_LIMITS.name)
    throw new Error(`Name the skill with lowercase letters, numbers, and single hyphens, up to ${CITROPY_SKILL_LIMITS.name} characters.`);
  if (typeof description !== "string" || !description.trim() || description.length > CITROPY_SKILL_LIMITS.description || /[\u0000-\u001f]/.test(description))
    throw new Error(`Describe when to use the skill in one line, up to ${CITROPY_SKILL_LIMITS.description.toLocaleString("en-US")} characters.`);
  if (typeof instructions !== "string" || !instructions.trim()) throw new Error("Write the skill's instructions.");
  const document = `---\nname: ${name}\ndescription: ${JSON.stringify(description.trim())}\n---\n\n${instructions.trim()}\n`;
  if (Buffer.byteLength(document) > MAX_SKILL_BYTES)
    throw new Error(`Skills can be up to ${MAX_SKILL_BYTES / 1000} KB.`);
  return document;
}

export async function saveCitropySkill(id: string | undefined, draft: CitropySkillDraft): Promise<void> {
  const document = skillDocument(draft);
  const current = id ? await findCitropySkill(id) : undefined;
  const folder = join(citropySkillsRoot, draft.name);
  const taken = (await listSkills()).some((entry) =>
    entry.scope === "citropy" && dirname(entry.path) === folder && dirname(entry.path) !== dirname(current?.path ?? ""),
  );
  if (taken) throw new Error(`A Citropy skill named ${draft.name} already exists.`);
  if (current && dirname(current.path) !== folder) await rename(dirname(current.path), folder);
  else await mkdir(folder, { recursive: true, mode: 0o700 });
  await writeFile(join(folder, current ? basename(current.path) : "SKILL.md"), document, { mode: 0o600 });
  forgetSkillInventory();
}
