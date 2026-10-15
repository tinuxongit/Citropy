import { Fragment, useEffect, useState } from "react";
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
import { useNarrowViewport } from "../lib/use-narrow-viewport.ts";
import { InboxSettings } from "./InboxSettings.tsx";
import { ProjectSettings } from "./ProjectSettings.tsx";
import { ProviderSettings } from "./ProviderSettings.tsx";
import { SectionLink, SectionSidebar } from "./SectionSidebar.tsx";
import { SkillsSettings } from "./SkillsSettings.tsx";

export function Settings({
  sidebarOpen,
  onNavigate,
  initialSection = "General",
}: {
  sidebarOpen: boolean;
  onNavigate: () => void;
  initialSection?: string;
}) {
  const { activeId: environment } = useEnvironments();
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const connected = useApp((state) => state.connected);
  const narrow = useNarrowViewport();
  const current = settingsSections.find((entry) => entry.name === section)!;

  return (
    <section className="section-view" aria-label="Settings">
      <SectionSidebar activeItem={section} open={sidebarOpen} title="Settings">
          {SETTINGS_GROUPS.map((group) => {
            const entries = settingsSections.filter((entry) => entry.group === group && isSectionShown(entry, narrow));
            if (!entries.length) return null;
            return <Fragment key={group}>
              <h2 className="section-nav-label">{group}</h2>
              {entries.map(({ name, icon }) => (
                <SectionLink
                  key={name}
                  icon={icon}
                  label={name}
                  active={section === name}
                  onSelect={() => {
                    setSection(name);
                    onNavigate();
                  }}
                />
              ))}
            </Fragment>;
          })}
      </SectionSidebar>
      <div className="settings scroll">
        <div className="settings-inner">
          <Fragment key={environment}>
            <header className="settings-heading">
              <div className="settings-heading-identity">
                <span className="settings-heading-icon"><current.icon size={20} /></span>
                <div>
                  <h1
                    className="settings-title"
                    data-settings-section={section.toLowerCase()}
                  >
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
    </section>
  );
}
