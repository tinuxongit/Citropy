import type { ComponentType } from "react";
import { REACTIONS, reactionLabel, type ReactionKey } from "../../../shared/reactions.ts";
import { reactToMessage } from "../lib/bots.ts";
import { useApp } from "../lib/store.ts";
import type { IconProps } from "./icons/kit.tsx";
import { HeartIcon, SmileIcon, ThumbDownIcon, ThumbUpIcon } from "./icons/reactions.tsx";
import { CircleCheckIcon } from "./icons/status.tsx";
import { Menu } from "./Menu.tsx";

const ICON_SIZE = 13;
const MENU_ICON_SIZE = 15;
const MENU_WIDTH = 180;

const REACTION_ICONS: Record<ReactionKey, ComponentType<IconProps>> = {
  like: ThumbUpIcon,
  dislike: ThumbDownIcon,
  love: HeartIcon,
  done: CircleCheckIcon,
};

function useReactions(messageId: string) {
  return useApp(state => state.messages[messageId]?.reactions);
}

export function ReactionPicker({ threadId, messageId }: { threadId: string; messageId: string }) {
  const reactions = useReactions(messageId);
  return (
    <Menu
      align="start"
      width={MENU_WIDTH}
      trigger={({ open, toggle, id }) => (
        <button id={id} className="icon-btn" type="button" aria-label="React to this message" title="React to this message" aria-expanded={open} onClick={toggle}>
          <SmileIcon size={ICON_SIZE} />
        </button>
      )}
      items={REACTIONS.map(({ key, label }) => {
        const Icon = REACTION_ICONS[key];
        const on = Boolean(reactions?.some(entry => entry.key === key));
        return { id: key, label, icon: <Icon size={MENU_ICON_SIZE} />, selected: on, onSelect: () => reactToMessage(threadId, messageId, key, !on) };
      })}
    />
  );
}

export function MessageReactions({ threadId, messageId }: { threadId: string; messageId: string }) {
  const reactions = useReactions(messageId);
  if (!reactions?.length) return null;
  return (
    <div className="message-reactions">
      {reactions.map(({ key }) => {
        const Icon = REACTION_ICONS[key];
        return (
          <button key={key} type="button" className="message-reaction" aria-pressed="true" aria-label={`Remove ${reactionLabel(key).toLowerCase()}`} title={`Remove ${reactionLabel(key).toLowerCase()}`} onClick={() => reactToMessage(threadId, messageId, key, false)}>
            <Icon size={ICON_SIZE} />
          </button>
        );
      })}
    </div>
  );
}
