import { useShallow } from "zustand/react/shallow";
import type { Bot, BotGroup } from "../../../../shared/bots.ts";
import { useApp } from "../../lib/store.ts";

export function useGroupMembers(group: BotGroup | undefined): Bot[] {
  return useApp(useShallow((state) => (group?.botIds ?? []).map((id) => state.bots[id]).filter((bot): bot is Bot => Boolean(bot))));
}
