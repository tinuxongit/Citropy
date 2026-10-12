import { useState } from "react";
import { BOT_LIMITS, botHandle, type BotGroup } from "../../../../shared/bots.ts";
import { reportError } from "../../lib/api.ts";
import { removeGroup, updateGroup } from "../../lib/bots.ts";
import { selectRosterEntry, useApp } from "../../lib/store.ts";
import { TrashIcon } from "../icons/actions.tsx";
import { CloseIcon, PlusIcon } from "../icons/marks.tsx";
import { Menu } from "../Menu.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { GroupAvatar } from "./GroupAvatar.tsx";
import { useGroupMembers } from "./use-group-members.ts";

const HEADER_AVATAR_SIZE = 64;
const MEMBER_AVATAR_SIZE = 28;
const MENU_AVATAR_SIZE = 18;

export function GroupPanel({ group }: { group: BotGroup }) {
  const members = useGroupMembers(group);
  const bots = useApp((state) => state.bots);
  const [name, setName] = useState(group.name);
  const change = (patch: Parameters<typeof updateGroup>[1]) => void updateGroup(group.id, patch).catch((error) => {
    setName(group.name);
    reportError(error);
  });
  const outsiders = Object.values(bots).filter((bot) => !group.botIds.includes(bot.id));
  const full = group.botIds.length >= BOT_LIMITS.groupMembersMax;
  const minimal = group.botIds.length <= BOT_LIMITS.groupMembersMin;
  return (
    <>
      <div className="group-panel-identity">
        <GroupAvatar group={group} size={HEADER_AVATAR_SIZE} />
        <label className="feature-field">
          <span>Name</span>
          <input maxLength={BOT_LIMITS.groupNameLength} value={name} onChange={(event) => setName(event.target.value)}
            onBlur={() => {
              const trimmed = name.trim();
              setName(trimmed);
              if (trimmed !== group.name) change({ name: trimmed });
            }}
            onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
      </div>
      <section aria-label="Members">
        <div className="bot-section-head">
          <h3 className="bot-section-title">Members · {members.length} of {BOT_LIMITS.groupMembersMax}</h3>
          <Menu
            align="end"
            width={220}
            trigger={({ open, toggle, id }) => (
              <button id={id} type="button" className="icon-btn" aria-label="Add bot" title={full ? `Groups hold up to ${BOT_LIMITS.groupMembersMax} bots` : "Add bot"} aria-expanded={open} disabled={full || !outsiders.length} onClick={toggle}>
                <PlusIcon size={14} />
              </button>
            )}
            items={outsiders.map((bot) => ({
              id: bot.id,
              label: bot.name,
              icon: <BotAvatar bot={bot} size={MENU_AVATAR_SIZE} />,
              onSelect: () => change({ botIds: [...group.botIds, bot.id] }),
            }))}
          />
        </div>
        <div className="group-members">
          {members.map((bot) => (
            <div key={bot.id} className="group-member">
              <button type="button" className="group-member-open" onClick={() => selectRosterEntry(bot.id)}>
                <BotAvatar bot={bot} size={MEMBER_AVATAR_SIZE} mood={group.working.includes(bot.id) ? "working" : "idle"} />
                <span className="bot-routine-text">
                  <strong className="truncate">{bot.name}</strong>
                  <small className="truncate">{group.working.includes(bot.id) ? "Working…" : `@${botHandle(bot.name)}`}</small>
                </span>
              </button>
              <button type="button" className="icon-btn" aria-label={`Remove ${bot.name}`} title={minimal ? `Groups need at least ${BOT_LIMITS.groupMembersMin} bots` : `Remove ${bot.name}`} disabled={minimal}
                onClick={() => change({ botIds: group.botIds.filter((id) => id !== bot.id) })}>
                <CloseIcon size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>
      <button type="button" className="bot-settings-link group-delete" onClick={() => void removeGroup(group)}>
        <TrashIcon size={16} />
        <span>Delete group</span>
      </button>
    </>
  );
}
