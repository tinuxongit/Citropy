import type { Bot } from "../../../../shared/bots.ts";
import { reportError } from "../../lib/api.ts";
import { duplicateBot, removeBot, updateBot } from "../../lib/bots.ts";
import { shortWhen } from "../../lib/format.ts";
import { selectBot, useApp } from "../../lib/store.ts";
import { CopyIcon, EyeIcon, EyeOffIcon, PinIcon, PinOffIcon, TrashIcon } from "../icons/actions.tsx";
import { MoreIcon } from "../icons/marks.tsx";
import { Menu } from "../Menu.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { botMood, lastActive } from "./bot-order.ts";

export function BotRow({ bot, now, onOpen }: { bot: Bot; now: number; onOpen: () => void }) {
  const active = useApp((state) => state.activeBotId === bot.id);
  const thread = useApp((state) => state.threads[bot.threadId]);
  const mood = botMood(thread);
  const change = (profile: Parameters<typeof updateBot>[1]) => void updateBot(bot.id, profile).catch(reportError);
  return (
    <div className="bot-card" data-active={active} data-bot={bot.id} onContextMenu={(event) => {
      event.preventDefault();
      event.currentTarget.querySelector<HTMLButtonElement>(".bot-more")?.click();
    }}>
      <button type="button" className="bot-row" aria-current={active || undefined} onClick={() => { selectBot(bot.id); onOpen(); }}>
        <BotAvatar bot={bot} size={36} mood={mood} />
        <span className="bot-row-text">
          <span className="bot-row-top">
            <span className="bot-row-name">{bot.name}</span>
            {bot.title && <span className="bot-row-title">{bot.title}</span>}
            {bot.pinned && <PinIcon size={11} className="bot-row-pin" aria-label="Pinned" />}
            <time className="bot-row-time">{shortWhen(lastActive(bot, thread), now)}</time>
          </span>
          <span className="bot-row-preview" data-mood={mood}>
            {mood === "working" ? "Working…" : mood === "awaiting" ? "Needs your input" : bot.preview || bot.title || "No messages yet"}
          </span>
        </span>
      </button>
      <Menu
        align="end"
        width={210}
        span=".bot-card"
        edge=".rail"
        trigger={({ open, toggle, id }) => (
          <button id={id} type="button" className="icon-btn bot-more" aria-label={`Options for ${bot.name}`} aria-expanded={open} onClick={toggle}>
            <MoreIcon size={15} />
          </button>
        )}
        items={[
          { id: "pin", label: bot.pinned ? "Unpin" : "Pin", icon: bot.pinned ? <PinOffIcon size={15} /> : <PinIcon size={15} />, onSelect: () => change({ pinned: !bot.pinned }) },
          { id: "hide", label: bot.hidden ? "Show" : "Hide", icon: bot.hidden ? <EyeIcon size={15} /> : <EyeOffIcon size={15} />, onSelect: () => change({ hidden: !bot.hidden }) },
          { id: "duplicate", label: "Duplicate", icon: <CopyIcon size={15} />, onSelect: () => void duplicateBot(bot.id).catch(reportError) },
          { id: "delete", label: "Delete", icon: <TrashIcon size={15} />, danger: true, onSelect: () => void removeBot(bot) },
        ]}
      />
    </div>
  );
}
