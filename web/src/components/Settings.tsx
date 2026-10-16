import { Fragment, useEffect, useState } from "react";
import { motion } from "motion/react";
import { SearchIcon } from "./icons/actions.tsx";
import { CloseIcon } from "./icons/marks.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { useEnvironments } from "../lib/environment.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { AppearanceSettings } from "./AppearanceSettings.tsx";
import { ApplicationSettings } from "./ApplicationSettings.tsx";
import { AssistanceSettings } from "./AssistanceSettings.tsx";
import { BrowserProfiles } from "./BrowserProfiles.tsx";
import { ConnectionsSettings } from "./ConnectionsSettings.tsx";
import { DiagnosticsSettings } from "./DiagnosticsSettings.tsx";
import { EnvironmentSettings } from "./EnvironmentSettings.tsx";
import { GeneralSettings } from "./GeneralSettings.tsx";
import { PhoneAccess } from "./PhoneAccess.tsx";
import { isSectionShown, settingsSections, SETTINGS_GROUPS } from "../lib/settings-sections.ts";
import { useModalDialog } from "../lib/use-modal-dialog.ts";
import { useNarrowViewport } from "../lib/use-narrow-viewport.ts";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { InboxSettings } from "./InboxSettings.tsx";
import { ProjectSettings } from "./ProjectSettings.tsx";
import { ProviderSettings } from "./ProviderSettings.tsx";
import { SectionLink } from "./SectionSidebar.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { SkillsSettings } from "./SkillsSettings.tsx";

export function Settings({
  initialSection = "General",
  onClose,
}: {
  initialSection?: string;
  onClose: () => void;
}) {
  const { activeId: environment } = useEnvironments();
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const [query, setQuery] = useState("");
  const connected = useApp((state) => state.connected);
  const narrow = useNarrowViewport();
  const { ref, present } = useModalDialog(".settings-search input");
  const reducedMotion = useReducedMotion();
  const current = settingsSections.find((entry) => entry.name === section)!;
  const needle = query.trim().toLowerCase();
  const matches = (entry: typeof current) =>
    !needle || `${entry.name} ${entry.description}`.toLowerCase().includes(needle);
  const shown = settingsSections.filter((entry) => isSectionShown(entry, narrow) && matches(entry));

  return (
    <motion.dialog
      ref={ref}
      className="settings-dialog"
      aria-label="Settings"
      inert={!present}
      initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
      transition={{ duration: reducedMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <nav
        className="section-nav settings-nav scroll sliding-selection"
        aria-label="Settings sections"
      >
        <label className="thread-search settings-search">
          <SearchIcon size={16} />
          <input
            aria-label="Search settings"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !query) return;
              event.preventDefault();
              setQuery("");
            }}
          />
        </label>
        <SelectionHighlight value={section} layout={needle} />
        {SETTINGS_GROUPS.map((group) => {
          const entries = shown.filter((entry) => entry.group === group);
          if (!entries.length) return null;
          return (
            <Fragment key={group}>
              <h2 className="section-nav-label">{group}</h2>
              {entries.map(({ name, icon }) => (
                <SectionLink
                  key={name}
                  icon={icon}
                  label={name}
                  active={section === name}
                  onSelect={() => setSection(name)}
                />
              ))}
            </Fragment>
          );
        })}
        {!shown.length && <p className="settings-nav-empty">No matching settings</p>}
      </nav>
      <div className="settings scroll">
        <div className="settings-inner">
          <Fragment key={environment}>
            <header className="settings-heading">
              <div className="settings-heading-identity">
                <span className="settings-heading-icon">
                  <current.icon size={20} />
                </span>
                <div>
                  <h1 className="settings-title" data-settings-section={section.toLowerCase()}>
                    {section}
                  </h1>
                  <p>{current.description}</p>
                </div>
              </div>
              {section === "Providers" && (
                <button
                  className="btn"
                  disabled={!connected}
                  onClick={() => send({ t: "providers.refresh", force: true })}
                >
                  <RefreshIcon size={14} />
                  Refresh models
                </button>
              )}
            </header>
            {section === "Environments" && <EnvironmentSettings />}
            {section === "Projects" && <ProjectSettings />}
            {section === "Skills" && <SkillsSettings />}
            {section === "AI assistance" && <AssistanceSettings />}
            {section === "Browser" && <BrowserProfiles />}
            {section === "Connections" && <ConnectionsSettings />}
            {section === "Phone access" && <PhoneAccess />}
            {section === "Resources" && <DiagnosticsSettings />}
            {section === "General" && <GeneralSettings />}
            {section === "Inbox" && <InboxSettings />}
            {section === "Appearance" && <AppearanceSettings />}
            {section === "Providers" && <ProviderSettings key={environment} />}
          </Fragment>
          <ApplicationSettings active={section === "Application"} />
        </div>
      </div>
      <button
        className="icon-btn settings-close"
        type="button"
        aria-label="Close settings"
        onClick={onClose}
      >
        <CloseIcon size={17} />
      </button>
    </motion.dialog>
  );
}
