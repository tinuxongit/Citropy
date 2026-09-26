import { useEffect, useRef, useState } from "react";
import { Check, Flame, ImagePlus, Moon, Sparkles, Sun } from "lucide-react";
import { reportError } from "../lib/api.ts";
import { saveBackgroundFile, useBackgroundFile, type BackgroundFileKind } from "../lib/background-files.ts";
import { useI18n } from "../lib/i18n.ts";
import { setBackgroundBlur, setBackgroundDim, setBackgroundFocus, setNavigationStyle, setStageBackground, setUiTransparency } from "../lib/preferences.ts";
import {
  setShowFailedTools,
  setSidebarMode,
  setTextStreaming,
  setTheme,
  setTypingAnimation,
  setTypingSpeed,
  setUiScale,
  toggleInspector,
  toggleSidebar,
  useApp,
  type SidebarMode,
} from "../lib/store.ts";
import { THEMES, type NavigationStyle, type StageBackground, type Theme } from "../lib/app-state.ts";
import { Range } from "./Range.tsx";

const THEME_DETAILS: Record<Theme, { label: string; icon: typeof Moon; note: string }> = {
  dark: { label: "Dark", icon: Moon, note: "Charcoal surfaces with white accents." },
  light: { label: "Light", icon: Sun, note: "Neutral surfaces with dark accents." },
  orange: { label: "Orange", icon: Flame, note: "Warm ember surfaces with orange accents." },
  purple: { label: "Purple", icon: Sparkles, note: "Dusk surfaces with violet accents." },
};

const BACKGROUNDS: { id: StageBackground; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "ascii", label: "ASCII noise" },
];

const ASCII_TEXTURE = ".·:-=+*#=-:·. ·:=+*#*+=:· .·:-=+*#".repeat(8);

function CustomImageOption({ selected }: { selected: boolean }) {
  const t = useI18n();
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
    <div className="custom-background">
      <button
        className="theme-option"
        type="button"
        aria-pressed={selected}
        title={t("Shows an image or GIF as the background.")}
        onClick={() => file ? setStageBackground(kind) : input.current?.click()}
      >
        <span
          className="background-preview"
          data-background={kind}
          data-empty={!url || undefined}
          style={url ? { backgroundImage: `url("${url}")` } : undefined}
          aria-hidden="true"
        >
          {!url && <><ImagePlus size={18} />{t("Upload an image or GIF")}</>}
        </span>
        <span className="theme-option-label">
          <span>{t("Custom image")}</span>
          {selected && <Check size={16} />}
        </span>
      </button>
      {file && <button className="custom-background-replace" type="button" onClick={() => input.current?.click()}>{t("Replace file…")}</button>}
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

export function AppearanceSettings() {
  const t = useI18n();
  const uiScale = useApp((state) => state.uiScale);
  const theme = useApp((state) => state.theme);
  const navigationStyle = useApp((state) => state.navigationStyle);
  const stageBackground = useApp((state) => state.stageBackground);
  const backgroundDim = useApp((state) => state.backgroundDim);
  const backgroundBlur = useApp((state) => state.backgroundBlur);
  const backgroundFocus = useApp((state) => state.backgroundFocus);
  const uiTransparency = useApp((state) => state.uiTransparency);
  const sidebar = useApp((state) => state.sidebarOpen);
  const inspector = useApp((state) => state.inspectorOpen);
  const sidebarMode = useApp((state) => state.sidebarMode);
  const textStreaming = useApp((state) => state.textStreaming);
  const typingAnimation = useApp((state) => state.typingAnimation);
  const typingSpeed = useApp((state) => state.typingSpeed);
  const showFailedTools = useApp((state) => state.showFailedTools);

  return (
    <>
      <h2 className="settings-group-heading">{t("Interface size")}</h2>
      <div className="settings-group size-setting">
        <div className="size-setting-heading">
          <div>
            <label htmlFor="ui-scale">{t("UI size")}</label>
            <p>{t("Scale text, icons, and controls together.")}</p>
          </div>
          <output htmlFor="ui-scale">{uiScale}%</output>
        </div>
        <Range
          id="ui-scale"
          min={75}
          max={150}
          step="5"
          value={uiScale}
          aria-valuetext={t("{value} percent", { value: uiScale })}
          onChange={(event) => setUiScale(Number(event.target.value))}
        />
        <div className="size-setting-labels">
          <span>{t("Compact")}</span>
          <button
            type="button"
            onClick={() => setUiScale(100)}
            disabled={uiScale === 100}
          >{" "}{t("Reset to 100%")}{" "}</button>
          <span>{t("Larger")}</span>
        </div>
      </div>
      <h2 className="settings-group-heading">{t("Layout")}</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>{t("Conversation sidebar")}</strong>
            <small>{t("Keep your conversations alongside the chat.")}</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch" checked={sidebar} onChange={toggleSidebar} />
        </label>
        <label className="setting-row">
          <span>
            <strong>{t("Inspector")}</strong>
            <small>{t("Show changes, files, and the terminal next to your chat.")}</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch" checked={inspector} onChange={toggleInspector} />
        </label>
        <label className="setting-row">
          <span>
            <strong>{t("Sidebar mode")}</strong>
            <small>{t("Workspaces shows one folder at a time. Global lists every open folder and its conversations.")}</small>
          </span>
          <select value={sidebarMode} onChange={(event) => setSidebarMode(event.target.value as SidebarMode)}>
            <option value="workspaces">{t("Workspaces")}</option>
            <option value="global">{t("Global")}</option>
          </select>
        </label>
        <label className="setting-row">
          <span>
            <strong>{t("Navigation layout")}</strong>
            <small>{t("Side strip keeps source control, GitHub, usage and settings on the left edge. Bottom bar puts them under the conversation list.")}</small>
          </span>
          <select value={navigationStyle} onChange={(event) => setNavigationStyle(event.target.value as NavigationStyle)}>
            <option value="strip">{t("Side strip")}</option>
            <option value="bar">{t("Bottom bar")}</option>
          </select>
        </label>
      </div>
      <p className="settings-note">{" "}{t("Layout preferences are saved on this device.")}{" "}</p>
      <h2 className="settings-group-heading">{t("Theme")}</h2>
      <div
        className="theme-options"
        role="group"
        aria-label={t("Color theme")}
      >
        {THEMES.map((value) => {
          const { label, icon: Icon } = THEME_DETAILS[value];
          return (
            <button
              className="theme-option"
              key={value}
              type="button"
              aria-pressed={theme === value}
              onClick={() => setTheme(value)}
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
                <span>{t(label)}</span>
                {theme === value && <Check size={16} />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="settings-note">{t(THEME_DETAILS[theme].note)}</p>
      <h2 className="settings-group-heading">{t("Background", undefined, "background")}</h2>
      <div className="theme-options" role="group" aria-label={t("Conversation background")}>
        {BACKGROUNDS.map(({ id, label }) => (
          <button
            className="theme-option"
            key={id}
            type="button"
            aria-pressed={stageBackground === id}
            onClick={() => setStageBackground(id)}
          >
            <span className="background-preview" data-background={id} aria-hidden="true">
              {id === "ascii" && ASCII_TEXTURE}
            </span>
            <span className="theme-option-label">
              <span>{t(label, undefined, "background")}</span>
              {stageBackground === id && <Check size={16} />}
            </span>
          </button>
        ))}
        <CustomImageOption selected={stageBackground === "image"} />
      </div>
      <p className="settings-note">{t("Shown behind the main area of every screen. Custom images stay on this computer.")}</p>
      {stageBackground === "image" && (
        <div className="settings-group settings-group-spaced">
          {[
            { label: "Dim", hint: "Darken the image so text stays easy to read.", value: backgroundDim, max: 90, unit: "%", change: setBackgroundDim },
            { label: "Blur", hint: "Soften the whole image. 0 keeps it sharp.", value: backgroundBlur, max: 40, unit: "px", change: setBackgroundBlur },
            { label: "Reading area", hint: "Darken and blur the image behind the content column. 0 turns it off.", value: backgroundFocus, max: 100, unit: "%", change: setBackgroundFocus },
          ].map(({ label, hint, value, max, unit, change }) => (
            <div className="setting-row" key={label}>
              <span>
                <strong>{t(label)}</strong>
                <small>{t(hint)}</small>
              </span>
              <span className="setting-range">
                <Range
                  min={0}
                  max={max}
                  value={value}
                  aria-label={t(label)}
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
              <strong>{t("Interface transparency")}</strong>
              <small>{t("Let the background show through the sidebar, chat box, panels and settings.")}</small>
            </span>
            <span className="setting-range">
              <Range
                min={0}
                max={60}
                value={uiTransparency}
                aria-label={t("Interface transparency")}
                aria-valuetext={`${uiTransparency}%`}
                onChange={(event) => setUiTransparency(Number(event.target.value))}
              />
              <output>{uiTransparency}%</output>
            </span>
          </div>
        </div>
      )}
      <h2 className="settings-group-heading settings-group-spaced">{t("Conversation display")}</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>{t("Show failed-tools badge")}</strong>
            <small>{t("Show the failure count in work summaries. Tool results remain available when hidden.")}</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch"
            checked={showFailedTools} onChange={event => setShowFailedTools(event.target.checked)} />
        </label>
        <label className="setting-row">
          <span>
            <strong>{t("Text streaming")}</strong>
            <small>{" "}{t("Show text as it arrives. Turn off to wait for each text block to finish.")}{" "}</small>
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
            <strong>{t("Typing animation")}</strong>
            <small>{" "}{t("Reveal finished text gradually. Available when text streaming is off.")}{" "}</small>
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
            <label htmlFor="typing-speed">{t("Typing speed")}</label>
            <output htmlFor="typing-speed">
              {typingSpeed}{" "}{t("characters / second")}{" "}</output>
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
            <span>{t("Slower")}</span>
            <span>{t("Faster")}</span>
          </div>
        </div>
      </div>
      <p className="settings-note">{" "}{t("Tool activity stays live. Saved conversations appear immediately. Typing animation respects your system's reduced-motion setting.")}{" "}</p>
    </>
  );
}
