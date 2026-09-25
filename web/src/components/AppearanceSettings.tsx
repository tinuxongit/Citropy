import { Check, Moon, Sun } from "lucide-react";
import { useI18n } from "../lib/i18n.ts";
import { setNavigationStyle } from "../lib/preferences.ts";
import { setTheme, setUiScale, useApp } from "../lib/store.ts";
import type { NavigationStyle } from "../lib/app-state.ts";

export function AppearanceSettings() {
  const t = useI18n();
  const uiScale = useApp((state) => state.uiScale);
  const theme = useApp((state) => state.theme);
  const navigationStyle = useApp((state) => state.navigationStyle);

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
        <input
          id="ui-scale"
          type="range"
          min="75"
          max="150"
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
      <h2 className="settings-group-heading">{t("Navigation")}</h2>
      <div className="settings-group">
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
      <h2 className="settings-group-heading">{t("Theme")}</h2>
      <div
        className="theme-options"
        role="group"
        aria-label={t("Color theme")}
      >
        {(["dark", "light"] as const).map((value) => (
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
              {value === "dark" ? (
                <Moon size={16} />
              ) : (
                <Sun size={16} />
              )}
              <span>{value === "dark" ? t("Dark") : t("Light")}</span>
              {theme === value && <Check size={16} />}
            </span>
          </button>
        ))}
      </div>
      <p className="settings-note">
        {theme === "dark"
          ? t("Charcoal surfaces with white accents.")
          : t("Neutral surfaces with dark accents.")}
      </p>
    </>
  );
}
