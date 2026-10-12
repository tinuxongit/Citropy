import type { CSSProperties } from "react";
import type { BotLook } from "../../../../shared/bots.ts";
import type { BotMood } from "../../lib/roster.ts";
import { BotAccessoryLayer, accessoryHeadroom } from "./bot-accessories.tsx";
import { BotEyes } from "./bot-faces.tsx";
import { BOT_VIEWBOX, shapeGeometry } from "./bot-shapes.tsx";

const PHASE_SPAN_S = 12;
const PHASE_STEPS = 97;

function phase(id = ""): string {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return `${-((sum % PHASE_STEPS) / PHASE_STEPS) * PHASE_SPAN_S}s`;
}

function viewBox(look: BotLook): string {
  const headroom = accessoryHeadroom(look.accessory, look.shape);
  const side = BOT_VIEWBOX + headroom;
  return `${-headroom / 2} ${-headroom} ${side} ${side}`;
}

export function BotAvatar({ bot, size, mood = "idle" }: { bot: BotLook & { id?: string }; size: number; mood?: BotMood }) {
  const { body, face } = shapeGeometry(bot.shape);
  return (
    <svg
      className="bot-avatar"
      data-color={bot.color}
      data-shape={bot.shape}
      data-mood={mood}
      width={size}
      height={size}
      viewBox={viewBox(bot)}
      style={{ "--bot-phase": phase(bot.id) } as CSSProperties}
      aria-hidden="true"
    >
      <g className="bot-figure">
        <BotAccessoryLayer accessory={bot.accessory} shape={bot.shape} layer="back" />
        {body}
        <g className="bot-look">
          <g transform={`translate(${face.x} ${face.y})`}>
            <BotEyes face={bot.face} />
            <BotAccessoryLayer accessory={bot.accessory} shape={bot.shape} layer="face" />
          </g>
        </g>
        <BotAccessoryLayer accessory={bot.accessory} shape={bot.shape} layer="front" />
      </g>
    </svg>
  );
}
