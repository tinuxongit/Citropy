import type { MessageOrigin } from "../../shared/bots.ts";

export function withRoutineContext(prompt: string, origin?: MessageOrigin): string {
  if (origin?.kind !== "routine") return prompt;
  return `<citropy-routine>\nThe routine "${origin.name}" is running on its schedule. Do the task below and report the result.\n</citropy-routine>\n\n${prompt}`;
}
