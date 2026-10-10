import type { SkillInfo, ToolMention } from "./features.ts";

export interface MentionTag {
  name: string;
  title: string;
  icon: "book" | "citropy" | "site";
  url?: string;
}

export function skillTag(skill: Pick<SkillInfo, "name" | "scope">): MentionTag {
  return { name: skill.name, title: skill.name, icon: skill.scope === "citropy" ? "citropy" : "book" };
}

export function toolTag(tool: ToolMention): MentionTag {
  return tool.url
    ? { name: tool.name, title: tool.title, icon: "site", url: tool.url }
    : { name: tool.name, title: tool.title, icon: "citropy" };
}
