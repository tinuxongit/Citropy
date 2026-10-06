import { useRef } from "react";
import {
  setShowGitHubIdentity,
  setUiSoundVolume,
  setUiSounds,
  useApp,
} from "../lib/store.ts";
import { configureUiSounds, playUiSound, previewUiSound } from "../lib/ui-sound.ts";
import { Range } from "./Range.tsx";

export function GeneralSettings() {
  const showGitHubIdentity = useApp((state) => state.showGitHubIdentity);
  const uiSounds = useApp((state) => state.uiSounds);
  const uiAlertSounds = useApp((state) => state.uiAlertSounds);
  const uiSoundVolume = useApp((state) => state.uiSoundVolume);
  const volumePreview = useRef(0);

  return (
    <>
      <h2 className="settings-group-heading">{" "}Chat identity{" "}</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Use GitHub profile in chat</strong>
            <small>{" "}Show your connected GitHub username on your messages in the message navigator. Turn off to show 'You'.{" "}</small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={showGitHubIdentity}
            onChange={(event) => setShowGitHubIdentity(event.target.checked)}
          />
        </label>
      </div>
      <h2 className="settings-group-heading settings-group-spaced">Sounds</h2>
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Interface sounds</strong>
            <small>{" "}A quiet click when you press a button, a switch, or a tab.{" "}</small>
          </span>
          <span className="sound-row-controls">
            <button
              className="btn btn-sm"
              type="button"
              data-ui-sound="off"
              onClick={() => void previewUiSound("click")}
            >Preview</button>
            <input
              className="setting-switch"
              type="checkbox"
              role="switch"
              checked={uiSounds}
              onChange={(event) => setUiSounds(event.target.checked)}
            />
          </span>
        </label>
        <div className="sound-volume">
          <div className="sound-volume-heading">
            <label htmlFor="sound-volume">Volume</label>
            <output htmlFor="sound-volume">{uiSoundVolume}%</output>
          </div>
          <Range
            id="sound-volume"
            min={0}
            max={100}
            step="5"
            value={uiSoundVolume}
            aria-valuetext={`${uiSoundVolume} percent`}
            onChange={(event) => {
              const volume = Number(event.target.value);
              setUiSoundVolume(volume);
              const now = Date.now();
              if (!uiSounds || now - volumePreview.current < 150) return;
              volumePreview.current = now;
              configureUiSounds({ volume, interfaceSounds: uiSounds, alertSounds: uiAlertSounds });
              playUiSound("click");
            }}
          />
        </div>
      </div>
      <p className="settings-note">{" "}Volume also applies to the Citropy chime chosen in Notifications.{" "}</p>
    </>
  );
}
