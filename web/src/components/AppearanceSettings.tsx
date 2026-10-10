import { saveProjectDefaults } from "../lib/actions.ts";
import { resolveProjectSettings } from "../../../shared/project-settings.ts";
import { setAsciiLook, setBackgroundBlur, setBackgroundEverywhere, setBackgroundDim, setBackgroundFocus, setBackgroundFocusSpread, setOpaquePopups, setUiTransparency } from "../lib/preferences.ts";
import {
  setShowFailedTools,
  setTextStreaming,
  setTypingAnimation,
  setTypingSpeed,
  setChatWidth,
  useApp,
} from "../lib/store.ts";
import { CHAT_WIDTHS, type ChatWidth } from "../lib/app-state.ts";
import { Select } from "./Select.tsx";
import { Range } from "./Range.tsx";
import { InterfaceSize } from "./appearance/InterfaceSize.tsx";
import { ThemePicker } from "./appearance/ThemePicker.tsx";
import { BackgroundPicker } from "./appearance/BackgroundPicker.tsx";

export function AppearanceSettings() {
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
  const projectDefaults = useApp((state) => state.projectDefaults);
  const chatWidth = useApp((state) => state.chatWidth);

  return (
    <>
      <InterfaceSize />
      <ThemePicker />
      <BackgroundPicker />
      {(stageBackground === "ascii" || stageBackground === "image") && (
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
            <strong>Visual replies</strong>
            <small>Let providers answer with interactive charts, tables, and diagrams inside the conversation.</small>
          </span>
          <input className="setting-switch" type="checkbox" role="switch"
            checked={Boolean(resolveProjectSettings(projectDefaults).visualReplies)}
            onChange={event => void saveProjectDefaults({ ...projectDefaults, visualReplies: event.target.checked }).catch(reportError)} />
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
