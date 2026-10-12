import type { CSSProperties } from "react";
import type { Bot } from "../../../../shared/bots.ts";
import { BOT_VIEWBOX, BotBody, BotEyes } from "./bot-shapes.tsx";

export type BotMood = "idle" | "working" | "awaiting";

const PHASE_SPAN_S = 12;
const PHASE_STEPS = 97;

function phase(id = ""): string {
  const sum = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  return `${-((sum % PHASE_STEPS) / PHASE_STEPS) * PHASE_SPAN_S}s`;
}

export function BotAvatar({ bot, size, mood = "idle" }: { bot: Pick<Bot, "color" | "shape"> & { id?: string }; size: number; mood?: BotMood }) {
  return (
    <svg
      className="bot-avatar"
      data-color={bot.color}
      data-shape={bot.shape}
      data-mood={mood}
      width={size}
      height={size}
      viewBox={`0 0 ${BOT_VIEWBOX} ${BOT_VIEWBOX}`}
      style={{ "--bot-phase": phase(bot.id) } as CSSProperties}
      aria-hidden="true"
    >
      <g className="bot-figure">
        <BotBody shape={bot.shape} />
        <g className="bot-look"><BotEyes /></g>
      </g>
    </svg>
  );
}
