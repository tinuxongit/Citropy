import type { ComponentType } from "react";
import { FolderIcon } from "../components/icons/folders.tsx";
import { BookIcon } from "../components/icons/BookIcon.tsx";
import { GlobeIcon } from "../components/icons/GlobeIcon.tsx";
import { InboxIcon } from "../components/icons/InboxIcon.tsx";
import { LockIcon } from "../components/icons/LockIcon.tsx";
import { PaletteIcon } from "../components/icons/PaletteIcon.tsx";
import { PhoneIcon } from "../components/icons/PhoneIcon.tsx";
import { PlugIcon } from "../components/icons/hardware.tsx";
import { PulseIcon } from "../components/icons/PulseIcon.tsx";
import { ServerIcon } from "../components/icons/ServerIcon.tsx";
import { SlidersIcon } from "../components/icons/SlidersIcon.tsx";
import { SparkleIcon } from "../components/icons/SparkleIcon.tsx";
import { WindowIcon } from "../components/icons/WindowIcon.tsx";
import { WorkflowIcon } from "../components/icons/WorkflowIcon.tsx";
import { isRemote } from "./environment.ts";

export const SETTINGS_GROUPS = ["Preferences", "Workspaces", "Agents", "Tools", "System"] as const;

export interface SettingsSection {
  name: string;
  description: string;
  group: (typeof SETTINGS_GROUPS)[number];
  icon: ComponentType<{ size?: number }>;
  available?: () => boolean;
  desktopOnly?: boolean;
}

export const canShareLocally = () =>
  ["127.0.0.1", "localhost", "[::1]"].includes(location.hostname) && !isRemote();

export const isSectionShown = (section: SettingsSection, narrow: boolean) =>
  (!isRemote() || section.group !== "Tools") &&
  !(narrow && section.desktopOnly) &&
  (section.available?.() ?? true);

export const settingsSections: SettingsSection[] = [
  {
    name: "General",
    description: "Chat identity and interface sounds.",
    group: "Preferences",
    icon: SlidersIcon,
  },
  {
    name: "Appearance",
    description: "Interface size, theme, background, and how conversations look.",
    group: "Preferences",
    icon: PaletteIcon,
  },
  {
    name: "Inbox",
    description: "What reaches your inbox, popups, and the alert sound.",
    group: "Preferences",
    icon: InboxIcon,
  },
  {
    name: "Projects",
    description: "The settings new chats start with, and changes for single projects.",
    group: "Workspaces",
    icon: FolderIcon,
    desktopOnly: true,
  },
  {
    name: "Environments",
    description: "This computer, and the servers and containers you connect to.",
    group: "Workspaces",
    icon: ServerIcon,
    desktopOnly: true,
  },
  {
    name: "Providers",
    description: "Installed providers, accounts, and usage limits.",
    group: "Agents",
    icon: WorkflowIcon,
    desktopOnly: true,
  },
  {
    name: "AI assistance",
    description: "Models for conversation titles, commit messages, and code review.",
    group: "Agents",
    icon: SparkleIcon,
    desktopOnly: true,
  },
  {
    name: "Skills",
    description:
      "Skills you write once for every provider, and skills each provider has installed.",
    group: "Agents",
    icon: BookIcon,
    desktopOnly: true,
  },
  {
    name: "MCP servers",
    description: "Tools from MCP servers, added once for every provider.",
    group: "Agents",
    icon: PlugIcon,
    desktopOnly: true,
  },
  {
    name: "Browser",
    description: "Search engine, browser profiles, and what providers can access.",
    group: "Tools",
    icon: GlobeIcon,
    desktopOnly: true,
  },
  {
    name: "Connections",
    description: "Websites you signed in to, so agents can use them for you.",
    group: "Tools",
    icon: LockIcon,
    desktopOnly: true,
  },
  {
    name: "Phone access",
    description: "Use Citropy from your phone, on this Wi-Fi or anywhere through Tailscale.",
    group: "Tools",
    icon: PhoneIcon,
    available: canShareLocally,
    desktopOnly: true,
  },
  {
    name: "Resources",
    description: "Memory use, running conversations, and logs.",
    group: "System",
    icon: PulseIcon,
    desktopOnly: true,
  },
  {
    name: "Application",
    description: "Updates and restarts.",
    group: "System",
    icon: WindowIcon,
    desktopOnly: true,
  },
];
