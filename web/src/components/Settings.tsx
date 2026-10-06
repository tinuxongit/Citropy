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
import { useApp, viewportWidth } from "../lib/store.ts";
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
import { SectionSidebar } from "./SectionSidebar.tsx";
import { SkillsSettings } from "./SkillsSettings.tsx";

const GROUPS = ["Preferences", "Workspaces", "Agents", "Tools", "System"] as const;

const sections: { name: string; group: typeof GROUPS[number]; icon: LucideIcon; available?: () => boolean }[] = [
  { name: "General", group: "Preferences", icon: SlidersHorizontal },
  { name: "Appearance", group: "Preferences", icon: Palette },
  { name: "Notifications", group: "Preferences", icon: Bell },
  { name: "Projects", group: "Workspaces", icon: FolderCog },
  { name: "Environments", group: "Workspaces", icon: Server },
  { name: "Providers", group: "Agents", icon: Workflow },
  { name: "AI assistance", group: "Agents", icon: PencilLine },
  { name: "Skills", group: "Agents", icon: BookOpen },
  { name: "Browser", group: "Tools", icon: Globe },
  { name: "Local sharing", group: "Tools", icon: Smartphone, available: canShareLocally },
  { name: "Resources", group: "System", icon: Activity },
  { name: "Application", group: "System", icon: AppWindow },
];

export function Settings({
  sidebarOpen,
  onCloseSidebar,
  initialSection = "General",
}: {
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  initialSection?: string;
}) {
  const { activeId: environment } = useEnvironments();
  const [section, setSection] = useState(initialSection);
  useEffect(() => setSection(initialSection), [initialSection]);
  const connected = useApp((state) => state.connected);

  return (
    <section className="section-view" aria-label="Settings">
      <SectionSidebar activeItem={section} open={sidebarOpen} title="Settings">
          {GROUPS.map((group) => {
            const entries = sections.filter((entry) => entry.group === group && (!isRemote() || entry.group !== "Tools") && (entry.available?.() ?? true));
            if (!entries.length) return null;
            return <Fragment key={group}>
              <h2 className="section-nav-label">{group}</h2>
              {entries.map(({ name, icon: Icon }) => (
                <button
                  className="section-link"
                  data-settings-section={name.toLowerCase()}
                  type="button"
                  key={name}
                  aria-current={section === name ? "page" : undefined}
                  onClick={() => {
                    setSection(name);
                    if (viewportWidth() <= 720) onCloseSidebar();
                  }}
                >
                  <Icon size={17} />
                  <span>{name}</span>
                </button>
              ))}
            </Fragment>;
          })}
      </SectionSidebar>
      <div className="settings scroll">
        <div className="settings-inner">
          <Fragment key={environment}>
            <header className="settings-heading">
              <div>
                <h1
                  className="settings-title"
                  data-settings-section={section.toLowerCase()}
                >
                  {section}
                </h1>
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
