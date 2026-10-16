import type { BotGroup } from "../../../../shared/bots.ts";
import { BotAvatar } from "./BotAvatar.tsx";
import { useGroupMembers } from "./use-group-members.ts";

const SHOWN_MEMBERS = 3;
const MEMBER_SCALE = 0.62;

export function GroupAvatar({ group, size }: { group: BotGroup; size: number }) {
  const members = useGroupMembers(group).slice(0, SHOWN_MEMBERS);
  return (
    <span
      className="group-avatar"
      data-count={members.length}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {members.map((bot) => (
        <BotAvatar
          key={bot.id}
          bot={bot}
          size={Math.round(size * MEMBER_SCALE)}
          mood={group.working.includes(bot.id) ? "working" : "idle"}
        />
      ))}
    </span>
  );
}
