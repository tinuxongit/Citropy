import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons/marks.tsx";
import { CherryIcon, CitrusIcon, DropletIcon, FlameIcon, FlowerIcon, LeafIcon, MoonIcon, SunIcon, WavesIcon } from "./icons/nature.tsx";
import { CircleIcon } from "./icons/status.tsx";
import { ImagePlusIcon } from "./icons/media.tsx";
import { PaletteIcon } from "./PaletteIcon.tsx";
import { PipetteIcon } from "./icons/drawing.tsx";
import { SparkleIcon } from "./SparkleIcon.tsx";
import { reportError } from "../lib/api.ts";
import { saveBackgroundFile, useBackgroundFile, type BackgroundFileKind } from "../lib/background-files.ts";
import { setAsciiLook, setBackgroundBlur, setBackgroundEverywhere, setBackgroundDim, setBackgroundFocus, setBackgroundFocusSpread, setOpaquePopups, setStageBackground, setUiTransparency } from "../lib/preferences.ts";
import {
  setShowFailedTools,
  setTextStreaming,
  setTheme,
  setScheme,
  setCustomColor,
  setTypingAnimation,
  setTypingSpeed,
  setUiScale,
  setChatWidth,
  useApp,
} from "../lib/store.ts";
import { CHAT_WIDTHS, DEFAULT_UI_SCALE, SCHEMES, THEMES, type ChatWidth, type Scheme, type StageBackground, type Theme } from "../lib/app-state.ts";
import { Select } from "./Select.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { OptionStrip } from "./OptionStrip.tsx";
import { Range } from "./Range.tsx";
import { Collapsible } from "./Collapsible.tsx";
import { ColorPicker } from "./ColorPicker.tsx";

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

const BACKGROUNDS: { id: StageBackground; label: string }[] = [
  { id: "ascii", label: "ASCII noise" },
  { id: "default", label: "Default" },
];

const ASCII_TEXTURE = ".·:-=+*#=-:·. ·:=+*#*+=:· .·:-=+*#".repeat(8);

function CustomImageOption({ selected }: { selected: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const kind: BackgroundFileKind = "image";
  const file = useBackgroundFile(kind);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="custom-background" data-option={kind}>
      <button
        className="theme-option"
        type="button"
        aria-pressed={selected}
        title="Shows an image or GIF as the background."
        onClick={() => file ? setStageBackground(kind) : input.current?.click()}
      >
        <span
          className="background-preview"
          data-background={kind}
          data-empty={!url || undefined}
          style={url ? { backgroundImage: `url("${url}")` } : undefined}
          aria-hidden="true"
        >
          {!url && <><ImagePlusIcon size={18} />Upload an image or GIF</>}
        </span>
        <span className="theme-option-label">
          <span>Custom image</span>
          {selected && <CheckIcon size={16} />}
        </span>
      </button>
      {file && <button className="custom-background-replace" type="button" onClick={() => input.current?.click()}>Replace file…</button>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          saveBackgroundFile(kind, chosen).then(() => setStageBackground(kind)).catch(reportError);
        }}
      />
    </div>
  );
}

function CustomColorPicker() {
  const saved = useApp((state) => state.customColor);
  return <ColorPicker className="settings-group custom-color-picker" id="custom-color-picker" color={saved} onCommit={setCustomColor} />;
}

export function AppearanceSettings() {
  const uiScale = useApp((state) => state.uiScale);
  const theme = useApp((state) => state.theme);
  const scheme = useApp((state) => state.scheme);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const stageBackground = useApp((state) => state.stageBackground);
  const backgroundDim = useApp((state) => state.backgroundDim);
  const backgroundBlur = useApp((state) => state.backgroundBlur);
  const backgroundFocus = useApp((state) => state.backgroundFocus);
  const backgroundFocusSpread = useApp((state) => state.backgroundFocusSpread);
  const asciiDim = useApp((state) => state.asciiDim);
  const asciiBlur = useApp((state) => state.asciiBlur);
  const asciiFocus = useApp((state) => state.asciiFocus);
  const uiTransparency = useApp((state) => state.uiTransparency);
  const opaquePopups = useApp((state) => state.opaquePopups);
  const backgroundEverywhere = useApp((state) => state.backgroundEverywhere);
  const textStreaming = useApp((state) => state.textStreaming);
  const typingAnimation = useApp((state) => state.typingAnimation);
  const typingSpeed = useApp((state) => state.typingSpeed);
  const showFailedTools = useApp((state) => state.showFailedTools);
  const chatWidth = useApp((state) => state.chatWidth);

  return (
    <>
      <h2 className="settings-group-heading">Interface size</h2>
      <div className="settings-group size-setting">
        <div className="size-setting-heading">
          <div>
            <label htmlFor="ui-scale">UI size</label>
            <p>Scale text, icons, and controls together.</p>
          </div>
          <output htmlFor="ui-scale">{uiScale}%</output>
        </div>
        <Range
          id="ui-scale"
          min={75}
          max={150}
          step="5"
          value={uiScale}
          aria-valuetext={`${uiScale} percent`}
          onChange={(event) => setUiScale(Number(event.target.value))}
        />
        <div className="size-setting-labels">
          <span>Compact</span>
          <button
            type="button"
            onClick={() => setUiScale(DEFAULT_UI_SCALE)}
            disabled={uiScale === DEFAULT_UI_SCALE}
          >{" "}Reset to default{" "}</button>
          <span>Larger</span>
        </div>
      </div>
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
      <h2 className="settings-group-heading">Background</h2>
      <OptionStrip label="Conversation background" selected={stageBackground}>
        {BACKGROUNDS.map(({ id, label }) => (
          <button
            className="theme-option"
            key={id}
            data-option={id}
            type="button"
            aria-pressed={stageBackground === id}
            onClick={() => setStageBackground(id)}
          >
            <span className="background-preview" data-background={id} aria-hidden="true">
              {id === "ascii" && ASCII_TEXTURE}
            </span>
            <span className="theme-option-label">
              <span>{label}</span>
              {stageBackground === id && <CheckIcon size={16} />}
            </span>
          </button>
        ))}
        <CustomImageOption selected={stageBackground === "image"} />
      </OptionStrip>
      {stageBackground !== "default" && (
        <div className="settings-group settings-group-spaced">
          {[
            ...(stageBackground === "image" ? [
              { label: "Dim", hint: "Darken the background so text stays easy to read.", value: backgroundDim, max: 90, unit: "%", change: setBackgroundDim },
              { label: "Blur", hint: "Soften the whole background. 0 keeps it sharp.", value: backgroundBlur, max: 40, unit: "px", change: setBackgroundBlur },
              { label: "Reading area", hint: "Darken and blur the background behind the content column. 0 turns it off.", value: backgroundFocus, max: 100, unit: "%", change: setBackgroundFocus },
            ] : [
              { label: "Dim", hint: "Darken the background so text stays easy to read.", value: asciiDim, max: 90, unit: "%", change: (value: number) => setAsciiLook("asciiDim", value) },
              { label: "Blur", hint: "Soften the whole background. 0 keeps it sharp.", value: asciiBlur, max: 12, unit: "px", change: (value: number) => setAsciiLook("asciiBlur", value) },
              { label: "Reading area", hint: "Darken and blur the background behind the content column. 0 turns it off.", value: asciiFocus, max: 100, unit: "%", change: (value: number) => setAsciiLook("asciiFocus", value) },
            ]),
            ...((stageBackground === "image" ? backgroundFocus : asciiFocus) ? [{ label: "Reading area width", hint: "How far the reading area reaches past the conversation on each side.", value: backgroundFocusSpread, max: 400, unit: "px", change: setBackgroundFocusSpread }] : []),
          ].map(({ label, hint, value, max, unit, change }) => (
            <div className="setting-row" key={label}>
              <span>
                <strong>{label}</strong>
                <small>{hint}</small>
              </span>
              <span className="setting-range">
                <Range
                  min={0}
                  max={max}
                  value={value}
                  aria-label={label}
                  aria-valuetext={`${value}${unit}`}
                  onChange={(event) => change(Number(event.target.value))}
                />
                <output>{value}{unit}</output>
              </span>
            </div>
          ))}
        </div>
      )}
      {stageBackground !== "default" && (
        <div className="settings-group settings-group-spaced">
          <div className="setting-row">
            <span>
              <strong>Interface transparency</strong>
              <small>Let the background show through the sidebar, chat box, panels and settings.</small>
            </span>
            <span className="setting-range">
              <Range
                min={0}
                max={60}
                value={uiTransparency}
                aria-label="Interface transparency"
                aria-valuetext={`${uiTransparency}%`}
                onChange={(event) => setUiTransparency(Number(event.target.value))}
              />
              <output>{uiTransparency}%</output>
            </span>
          </div>
          <label className="setting-row">
            <span>
              <strong>Background on every page</strong>
              <small>Show the background in Settings, Source control, GitHub and Usage too, not only in conversations.</small>
            </span>
            <input className="setting-switch" type="checkbox" role="switch"
              checked={backgroundEverywhere} onChange={event => setBackgroundEverywhere(event.target.checked)} />
          </label>
          <label className="setting-row">
            <span>
              <strong>Opaque pop-ups</strong>
              <small>Make menus, pop-ups, and question and permission cards fully solid instead of slightly see-through.</small>
            </span>
            <input className="setting-switch" type="checkbox" role="switch"
              checked={opaquePopups} onChange={event => setOpaquePopups(event.target.checked)} />
          </label>
        </div>
      )}
      <h2 className="settings-group-heading settings-group-spaced">Conversation display</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Chat width</strong>
            <small>How wide messages and the chat box can grow on large screens.</small>
          </span>
          <Select value={chatWidth} onChange={(value) => setChatWidth(value as ChatWidth)}
            options={Object.entries(CHAT_WIDTHS).map(([value, { label }]) => ({ value, label }))} />
        </label>
        <label className="setting-row">
          <span>
            <strong>Show failed-tools badge</strong>
            <small>Show the failure count in work summaries. Tool results remain available when hidden.</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch"
            checked={showFailedTools} onChange={event => setShowFailedTools(event.target.checked)} />
        </label>
        <label className="setting-row">
          <span>
            <strong>Text streaming</strong>
            <small>{" "}Show text as it arrives. Turn off to wait for each text block to finish.{" "}</small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={textStreaming}
            onChange={(event) => setTextStreaming(event.target.checked)}
          />
        </label>
        <label className="setting-row" data-disabled={textStreaming}>
          <span>
            <strong>Typing animation</strong>
            <small>{" "}Reveal finished text gradually. Available when text streaming is off.{" "}</small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            disabled={textStreaming}
            checked={typingAnimation}
            onChange={(event) => setTypingAnimation(event.target.checked)}
          />
        </label>
        <div className="typing-speed-setting" data-disabled={textStreaming || !typingAnimation}>
          <div>
            <label htmlFor="typing-speed">Typing speed</label>
            <output htmlFor="typing-speed">
              {typingSpeed}{" "}characters / second{" "}</output>
          </div>
          <Range
            id="typing-speed"
            min={20}
            max={300}
            step={10}
            value={typingSpeed}
            disabled={textStreaming || !typingAnimation}
            onChange={(event) => setTypingSpeed(Number(event.target.value))}
          />
          <div className="typing-speed-labels">
            <span>Slower</span>
            <span>Faster</span>
          </div>
        </div>
      </div>
    </>
  );
}
