import { useEffect } from "react";
import { reportError } from "../../lib/api.ts";
import { duplicateBot, removeBot, removeGroup, updateBot, updateGroup } from "../../lib/bots.ts";
import { shortWhen } from "../../lib/format.ts";
import {
  botMood,
  lastActive,
  neighborOf,
  workingLine,
  type RosterEntry,
} from "../../lib/roster.ts";
import { selectRosterEntry, useApp } from "../../lib/store.ts";
import {
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PinIcon,
  PinOffIcon,
  TrashIcon,
} from "../icons/actions.tsx";
import { CircleCheckIcon, CircleDotIcon } from "../icons/status.tsx";
import { MoreIcon } from "../icons/marks.tsx";
import { Menu } from "../Menu.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { GroupAvatar } from "./GroupAvatar.tsx";
import { useGroupMembers } from "./use-group-members.ts";

const AVATAR_SIZE = 36;

export function RosterRow({
  entry,
  now,
  onOpen,
}: {
  entry: RosterEntry;
  now: number;
  onOpen: () => void;
}) {
  const { item } = entry;
  const active = useApp((state) => state.activeRosterId === item.id);
  const thread = useApp((state) => state.threads[item.threadId]);
  const members = useGroupMembers(entry.kind === "group" ? entry.item : undefined);
  const working =
    entry.kind === "group"
      ? members.filter((bot) => entry.item.working.includes(bot.id)).map((bot) => bot.name)
      : [];
  const mood = entry.kind === "bot" ? botMood(thread) : working.length ? "working" : "idle";
  const reading = useApp((state) => state.readingThreadId === item.threadId);
  const change = (patch: { pinned: boolean } | { hidden: boolean } | { unread: boolean }) =>
    void (entry.kind === "bot" ? updateBot(item.id, patch) : updateGroup(item.id, patch)).catch(
      reportError,
    );
  const hide = () => {
    if (!item.hidden && active) selectRosterEntry(neighborOf(useApp.getState(), item.id));
    change({ hidden: !item.hidden });
  };
  const preview =
    entry.kind === "group"
      ? working.length
        ? workingLine(working)
        : item.preview || `${members.length} bots`
      : mood === "working"
        ? "Working…"
        : mood === "awaiting"
          ? "Needs your input"
          : item.preview || "No messages yet";
  useEffect(() => {
    if (reading && item.unread) change({ unread: false });
  }, [reading, item.preview]);
  return (
    <div
      className="bot-card"
      data-active={active}
      data-unread={item.unread || undefined}
      data-bot={item.id}
      onContextMenu={(event) => {
        event.preventDefault();
        event.currentTarget.querySelector<HTMLButtonElement>(".bot-more")?.click();
      }}
    >
      <button
        type="button"
        className="bot-row"
        aria-current={active || undefined}
        onClick={() => {
          selectRosterEntry(item.id);
          onOpen();
        }}
      >
        {entry.kind === "bot" ? (
          <BotAvatar bot={entry.item} size={AVATAR_SIZE} mood={mood} />
        ) : (
          <GroupAvatar group={entry.item} size={AVATAR_SIZE} />
        )}
        <span className="bot-row-text">
          <span className="bot-row-top">
            <span className="bot-row-name">{item.name}</span>
            {entry.kind === "bot" && entry.item.title && (
              <span className="bot-row-title">{entry.item.title}</span>
            )}
            {item.pinned && <PinIcon size={11} className="bot-row-pin" aria-label="Pinned" />}
            <time className="bot-row-time">{shortWhen(lastActive(item, thread), now)}</time>
          </span>
          <span className="bot-row-bottom">
            <span className="bot-row-preview" data-mood={mood}>
              {preview}
            </span>
            {item.unread && <span className="bot-row-unread" role="img" aria-label="Unread" />}
          </span>
        </span>
      </button>
      <Menu
        align="end"
        width={210}
        span=".bot-card"
        edge=".rail"
        trigger={({ open, toggle, id }) => (
          <button
            id={id}
            type="button"
            className="icon-btn bot-more"
            aria-label={`Options for ${item.name}`}
            aria-expanded={open}
            onClick={toggle}
          >
            <MoreIcon size={15} />
          </button>
        )}
        items={[
          {
            id: "pin",
            label: item.pinned ? "Unpin" : "Pin",
            icon: item.pinned ? <PinOffIcon size={15} /> : <PinIcon size={15} />,
            onSelect: () => change({ pinned: !item.pinned }),
          },
          ...(item.preview
            ? [
                {
                  id: "unread",
                  label: item.unread ? "Mark as read" : "Mark as unread",
                  icon: item.unread ? <CircleCheckIcon size={15} /> : <CircleDotIcon size={15} />,
                  onSelect: () => change({ unread: !item.unread }),
                },
              ]
            : []),
          {
            id: "hide",
            label: item.hidden ? "Unhide" : "Hide",
            icon: item.hidden ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />,
            onSelect: hide,
          },
          ...(entry.kind === "bot"
            ? [
                {
                  id: "duplicate",
                  label: "Duplicate",
                  icon: <CopyIcon size={15} />,
                  onSelect: () => void duplicateBot(item.id).catch(reportError),
                },
              ]
            : []),
          {
            id: "delete",
            label: "Delete",
            icon: <TrashIcon size={15} />,
            danger: true,
            onSelect: () =>
              void (entry.kind === "bot" ? removeBot(entry.item) : removeGroup(entry.item)),
          },
        ]}
      />
    </div>
  );
}
