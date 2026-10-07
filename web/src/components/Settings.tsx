import { Fragment, useEffect, useState } from "react";
import {
  Activity,
  AppWindow,
  Bell,
  BookOpen,
  FolderCog,
  Globe,
  Palette,
  PencilLine,
  RefreshCw,
  Server,
  SlidersHorizontal,
  Smartphone,
  Workflow,
  type LucideIcon,
} from "lucide-react";
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
import { NotificationSettings } from "./NotificationSettings.tsx";
import { ProjectSettings } from "./ProjectSettings.tsx";
import { ProviderSettings } from "./ProviderSettings.tsx";
import { SectionLink, SectionSidebar } from "./SectionSidebar.tsx";
import { SkillsSettings } from "./SkillsSettings.tsx";

const GROUPS = ["Preferences", "Workspaces", "Agents", "Tools", "System"] as const;

const sections: { name: string; description: string; group: typeof GROUPS[number]; icon: LucideIcon; available?: () => boolean }[] = [
  { name: "General", description: "Chat identity and interface sounds.", group: "Preferences", icon: SlidersHorizontal },
  { name: "Appearance", description: "Interface size, theme, background, and how conversations look.", group: "Preferences", icon: Palette },
  { name: "Notifications", description: "Alerts when an agent finishes, and the sound they make.", group: "Preferences", icon: Bell },
  { name: "Projects", description: "Your project folders and their options.", group: "Workspaces", icon: FolderCog },
  { name: "Environments", description: "This computer, and the servers and containers you connect to.", group: "Workspaces", icon: Server },
  { name: "Providers", description: "Installed providers, accounts, and usage limits.", group: "Agents", icon: Workflow },
  { name: "AI assistance", description: "Models for conversation titles, commit messages, and code review.", group: "Agents", icon: PencilLine },
  { name: "Skills", description: "Skills your providers can use, and how they are shared.", group: "Agents", icon: BookOpen },
  { name: "Browser", description: "Search engine, browser profiles, and what providers can access.", group: "Tools", icon: Globe },
  { name: "Local sharing", description: "Use Citropy from your phone on the same Wi-Fi.", group: "Tools", icon: Smartphone, available: canShareLocally },
  { name: "Resources", description: "Memory use, running conversations, and logs.", group: "System", icon: Activity },
  { name: "Application", description: "Updates and restarts.", group: "System", icon: AppWindow },
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
                  <RefreshCw size={14} />
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
            {section === "Notifications" && <NotificationSettings />}
            {section === "Appearance" && <AppearanceSettings />}
            {section === "Providers" && <ProviderSettings key={environment} />}
          </Fragment>
          <ApplicationSettings active={section === "Application"} />
        </div>
      </div>
    </section>
  );
}
