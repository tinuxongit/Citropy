export const SLASH_COMMAND = /^\/[\w.:-]+(?:\s|$)/;

export function withInstructions(text: string, instructions: string): string {
  if (!instructions) return text;
  return SLASH_COMMAND.test(text.trim()) ? `${text}\n\n${instructions}` : `${instructions}\n\n${text}`;
}

export function withSkills(text: string, skills: Array<{ name: string; path: string }>): string {
  return withInstructions(text, skills.map((skill) => `Use the ${skill.name} skill. Read its instructions at ${skill.path}.`).join("\n"));
}
