import { BOT_COLORS, BOT_SHAPES, type Bot } from "../../../../shared/bots.ts";
import { BotAvatar } from "./BotAvatar.tsx";

export type BotLook = Pick<Bot, "color" | "shape">;

const AVATAR_SIZE = 88;
const SHAPE_SIZE = 28;

export function BotLookPicker({ look, onChange }: { look: BotLook; onChange: (patch: Partial<BotLook>) => void }) {
  return (
    <div className="bot-settings-avatar">
      <BotAvatar bot={look} size={AVATAR_SIZE} />
      <div className="bot-swatches" role="radiogroup" aria-label="Color">
        {BOT_COLORS.map((color) => (
          <button key={color} type="button" role="radio" className="bot-swatch" data-color={color} aria-checked={look.color === color} aria-label={color} title={color} onClick={() => onChange({ color })} />
        ))}
      </div>
      <div className="bot-shapes" role="radiogroup" aria-label="Shape">
        {BOT_SHAPES.map((shape) => (
          <button key={shape} type="button" role="radio" className="bot-shape" aria-checked={look.shape === shape} aria-label={shape} title={shape} onClick={() => onChange({ shape })}>
            <BotAvatar bot={{ color: look.color, shape }} size={SHAPE_SIZE} />
          </button>
        ))}
      </div>
    </div>
  );
}
