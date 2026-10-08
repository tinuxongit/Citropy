import { Fragment, useEffect, useState, type ComponentType } from "react";
import { RefreshIcon } from "./icons/rotation.tsx";
import { FolderIcon } from "./icons/folders.tsx";
import { BookIcon } from "./BookIcon.tsx";
import { GlobeIcon } from "./GlobeIcon.tsx";
import { InboxIcon } from "./InboxIcon.tsx";
import { PaletteIcon } from "./PaletteIcon.tsx";
import { PhoneIcon } from "./PhoneIcon.tsx";
import { PulseIcon } from "./PulseIcon.tsx";
import { ServerIcon } from "./ServerIcon.tsx";
import { SlidersIcon } from "./SlidersIcon.tsx";
import { SparkleIcon } from "./SparkleIcon.tsx";
import { WindowIcon } from "./WindowIcon.tsx";
import { WorkflowIcon } from "./WorkflowIcon.tsx";
import { isRemote, useEnvironments } from "../lib/environment.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";
import { AppearanceSettings } from "./AppearanceSettings.tsx";
import { ApplicationSettings } from "./ApplicationSettings.tsx";
import { AssistanceSettings } from "./AssistanceSettings.tsx";
import { BrowserProfiles } from "./BrowserProfiles.tsx";
import { DiagnosticsSettings } from "./DiagnosticsSettings.tsx";
import { EnvironmentSettings } from "./EnvironmentSettings.tsx";
import { GeneralSettings } from "./GeneralSettings.tsx";
import { canShareLocally, LocalSharing } from "./LocalSharing.tsx";
import { InboxSettings } from "./InboxSettings.tsx";
import { ProjectSettings } from "./ProjectSettings.tsx";
import { ProviderSettings } from "./ProviderSettings.tsx";
import { SectionLink, SectionSidebar } from "./SectionSidebar.tsx";
import { SkillsSettings } from "./SkillsSettings.tsx";

const GROUPS = ["Preferences", "Workspaces", "Agents", "Tools", "System"] as const;

const sections: { name: string; description: string; group: typeof GROUPS[number]; icon: ComponentType<{ size?: number }>; available?: () => boolean }[] = [
  { name: "General", description: "Chat identity and interface sounds.", group: "Preferences", icon: SlidersIcon },
  { name: "Appearance", description: "Interface size, theme, background, and how conversations look.", group: "Preferences", icon: PaletteIcon },
  { name: "Inbox", description: "What reaches your inbox, popups, and the alert sound.", group: "Preferences", icon: InboxIcon },
  { name: "Projects", description: "Your project folders and their options.", group: "Workspaces", icon: FolderIcon },
  { name: "Environments", description: "This computer, and the servers and containers you connect to.", group: "Workspaces", icon: ServerIcon },
  { name: "Providers", description: "Installed providers, accounts, and usage limits.", group: "Agents", icon: WorkflowIcon },
  { name: "AI assistance", description: "Models for conversation titles, commit messages, and code review.", group: "Agents", icon: SparkleIcon },
  { name: "Skills", description: "Skills your providers can use, and how they are shared.", group: "Agents", icon: BookIcon },
  { name: "Browser", description: "Search engine, browser profiles, and what providers can access.", group: "Tools", icon: GlobeIcon },
  { name: "Local sharing", description: "Use Citropy from your phone on the same Wi-Fi.", group: "Tools", icon: PhoneIcon, available: canShareLocally },
  { name: "Resources", description: "Memory use, running conversations, and logs.", group: "System", icon: PulseIcon },
  { name: "Application", description: "Updates and restarts.", group: "System", icon: WindowIcon },
];

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
  const current = sections.find((entry) => entry.name === section)!;

  return (
    <section className="section-view" aria-label="Settings">
      <SectionSidebar activeItem={section} open={sidebarOpen} title="Settings">
          {GROUPS.map((group) => {
            const entries = sections.filter((entry) => entry.group === group && (!isRemote() || entry.group !== "Tools") && (entry.available?.() ?? true));
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
            {section === "Local sharing" && <LocalSharing />}
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
