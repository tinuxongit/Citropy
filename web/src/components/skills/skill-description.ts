import type { SkillInfo } from "../../../../shared/features.ts";

export const skillDescription = (skill: SkillInfo) => skill.description || "No description provided.";
