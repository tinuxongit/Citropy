import { useState } from "react";
import { CheckIcon } from "../icons/marks.tsx";
import { CherryIcon, CitrusIcon, DropletIcon, FlameIcon, FlowerIcon, LeafIcon, MoonIcon, SunIcon, WavesIcon } from "../icons/nature.tsx";
import { CircleIcon } from "../icons/status.tsx";
import { PaletteIcon } from "../PaletteIcon.tsx";
import { PipetteIcon } from "../icons/drawing.tsx";
import { SparkleIcon } from "../SparkleIcon.tsx";
import { setCustomColor, setScheme, setTheme, useApp } from "../../lib/store.ts";
import { SCHEMES, THEMES, type Scheme, type Theme } from "../../lib/app-state.ts";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { OptionStrip } from "../OptionStrip.tsx";
import { Collapsible } from "../Collapsible.tsx";
import { ColorPicker } from "../ColorPicker.tsx";

const THEME_DETAILS: Record<Theme, { label: string; icon: typeof MoonIcon }> = {
  neutral: { label: "Neutral", icon: CircleIcon },
  orange: { label: "Orange", icon: FlameIcon },
  purple: { label: "Purple", icon: SparkleIcon },
  blue: { label: "Blue", icon: DropletIcon },
  green: { label: "Green", icon: LeafIcon },
  teal: { label: "Teal", icon: WavesIcon },
  pink: { label: "Pink", icon: FlowerIcon },
  red: { label: "Red", icon: CherryIcon },
  yellow: { label: "Yellow", icon: CitrusIcon },
  custom: { label: "Custom color", icon: PaletteIcon },
};

const SCHEME_DETAILS: Record<Scheme, { label: string; icon: typeof MoonIcon }> = {
  dark: { label: "Dark", icon: MoonIcon },
  light: { label: "Light", icon: SunIcon },
};

function CustomColorPicker() {
  const saved = useApp((state) => state.customColor);
  return <ColorPicker className="settings-group custom-color-picker" id="custom-color-picker" color={saved} onCommit={setCustomColor} />;
}

export function ThemePicker() {
  const theme = useApp((state) => state.theme);
  const scheme = useApp((state) => state.scheme);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  return (
    <>
      <h2 className="settings-group-heading">Theme</h2>
      <div className="scheme-switch sliding-selection" role="group" aria-label="Mode">
        <SelectionHighlight value={scheme} />
        {SCHEMES.map((value) => {
          const { label, icon: Icon } = SCHEME_DETAILS[value];
          return (
            <button key={value} type="button" aria-pressed={scheme === value} onClick={() => setScheme(value)}>
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>
      <OptionStrip label="Color theme" selected={theme}>
        {THEMES.map((value) => {
          const { label, icon: Icon } = THEME_DETAILS[value];
          const card = (
            <button
              className="theme-option"
              key={value}
              data-option={value === "custom" ? undefined : value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => {
                setTheme(value);
                setColorPickerOpen(false);
              }}
            >
              <span
                className="theme-preview"
                data-theme={value}
                aria-hidden="true"
              >
                <span className="theme-preview-rail">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="theme-preview-chat">
                  <i />
                  <i />
                  <span />
                </span>
              </span>
              <span className="theme-option-label">
                <Icon size={16} />
                <span>{label}</span>
                {theme === value && <CheckIcon size={16} />}
              </span>
            </button>
          );
          if (value !== "custom") return card;
          const pickerShown = colorPickerOpen && theme === "custom";
          return (
            <div className="custom-color" key={value} data-option={value}>
              {card}
              <button
                className="custom-color-toggle"
                type="button"
                aria-label="Edit custom color"
                aria-expanded={pickerShown}
                aria-controls="custom-color-picker"
                onClick={() => {
                  setTheme("custom");
                  setColorPickerOpen(!pickerShown);
                }}
              >
                <PipetteIcon size={14} />
              </button>
            </div>
          );
        })}
      </OptionStrip>
      <Collapsible open={colorPickerOpen && theme === "custom"} className="custom-color-reveal">
        <CustomColorPicker />
      </Collapsible>
    </>
  );
}
