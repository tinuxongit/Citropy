import templates from "./bot-templates.json" with { type: "json" };
import type { BotLook } from "./bots.ts";
import type { RoutineDraft } from "./routines.ts";

export interface BotTemplate {
  id: string;
  name: string;
  title: string;
  description: string;
  look: BotLook;
  routine: RoutineDraft;
}

export const BOT_TEMPLATES = templates as BotTemplate[];

export function botTemplate(id: string): BotTemplate {
  const template = BOT_TEMPLATES.find(entry => entry.id === id);
  if (!template) throw new Error(`There is no bot template named "${id}".`);
  return template;
}
