import { useState, type CSSProperties } from "react";
import { BOT_LOOK_OPTIONS, lookLabel, type BotLook } from "../../../../shared/bots.ts";
import { ChevronLeftIcon, ChevronRightIcon } from "../icons/chevrons.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { BotAvatar } from "./BotAvatar.tsx";

const AVATAR_SIZE = 88;
const OPTION_SIZE = 40;
const OPTIONS_PER_PAGE = 5;
const PAGES_KEPT_EACH_SIDE = 2;
const PART_TABS = ["shape", "face", "accessory"] as const;

type Part = (typeof PART_TABS)[number];

function centeredOn(look: BotLook, part: Part): number {
  return (
    (BOT_LOOK_OPTIONS[part].values as readonly string[]).indexOf(look[part]) -
    Math.floor(OPTIONS_PER_PAGE / 2)
  );
}

function slotsAround(position: number): number[] {
  const first = position - PAGES_KEPT_EACH_SIDE * OPTIONS_PER_PAGE;
  return Array.from(
    { length: (2 * PAGES_KEPT_EACH_SIDE + 1) * OPTIONS_PER_PAGE },
    (_, index) => first + index,
  );
}

function wrap(slot: number, length: number): number {
  return ((slot % length) + length) % length;
}

export function BotLookPicker({
  look,
  onChange,
}: {
  look: BotLook;
  onChange: (patch: Partial<BotLook>) => void;
}) {
  const [part, setPart] = useState<Part>("shape");
  const [position, setPosition] = useState(() => centeredOn(look, "shape"));
  const { label, values } = BOT_LOOK_OPTIONS[part];
  const choosePart = (entry: Part) => {
    setPart(entry);
    setPosition(centeredOn(look, entry));
  };
  const turn = (direction: number) => setPosition(position + direction);
  return (
    <div className="bot-settings-avatar">
      <BotAvatar bot={look} size={AVATAR_SIZE} />
      <div className="bot-swatches" role="radiogroup" aria-label={BOT_LOOK_OPTIONS.color.label}>
        {BOT_LOOK_OPTIONS.color.values.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            className="bot-swatch"
            data-color={color}
            aria-checked={look.color === color}
            aria-label={color}
            title={color}
            onClick={() => onChange({ color })}
          />
        ))}
      </div>
      <div
        className="segmented-tabs sliding-selection bot-look-tabs"
        role="tablist"
        aria-label="Look"
      >
        <SelectionHighlight value={part} />
        {PART_TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={entry === part}
            onClick={() => choosePart(entry)}
          >
            {BOT_LOOK_OPTIONS[entry].label}
          </button>
        ))}
      </div>
      <div
        className="bot-option-carousel"
        style={{ "--bot-options-per-page": OPTIONS_PER_PAGE } as CSSProperties}
      >
        <button
          type="button"
          className="icon-btn"
          aria-label={`Previous ${label.toLowerCase()} options`}
          onClick={() => turn(-1)}
        >
          <ChevronLeftIcon size={16} />
        </button>
        <div className="bot-option-window">
          <div
            key={part}
            className="bot-shapes"
            role="radiogroup"
            aria-label={label}
            style={{ "--bot-option-offset": position } as CSSProperties}
          >
            {slotsAround(position).map((slot) => {
              const value = values[wrap(slot, values.length)]!;
              return (
                <button
                  key={slot}
                  type="button"
                  role="radio"
                  className="bot-shape"
                  style={{ "--bot-option-slot": slot } as CSSProperties}
                  inert={slot < position || slot >= position + OPTIONS_PER_PAGE}
                  aria-checked={look[part] === value}
                  aria-label={lookLabel(value)}
                  title={lookLabel(value)}
                  onClick={() => onChange({ [part]: value })}
                >
                  <BotAvatar bot={{ ...look, [part]: value }} size={OPTION_SIZE} />
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Next ${label.toLowerCase()} options`}
          onClick={() => turn(1)}
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </div>
  );
}
