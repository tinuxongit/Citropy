import type { ComponentType } from "react";
import { InterfaceSize } from "../appearance/InterfaceSize.tsx";
import { ThemePicker } from "../appearance/ThemePicker.tsx";
import { BackgroundPicker } from "../appearance/BackgroundPicker.tsx";
import { InboxSettings } from "../InboxSettings.tsx";
import { RuntimeDownloads } from "../RuntimeDownloads.tsx";
import { ProjectStep } from "./ProjectStep.tsx";
import { ProvidersStep } from "./ProvidersStep.tsx";

export interface SetupStep {
  label: string;
  hint: string;
  title: string;
  description: string;
  Body: ComponentType;
}

export const SETUP_STEPS: SetupStep[] = [
  { label: "Appearance", hint: "Size, theme and background", title: "Choose how Citropy looks", description: "Pick a size, a theme and a background. Citropy changes as you choose.", Body: () => <><InterfaceSize /><ThemePicker /><BackgroundPicker /></> },
  { label: "Alerts", hint: "Popups and sounds", title: "Choose your alerts", description: "Decide how Citropy tells you when an agent finishes or needs you.", Body: InboxSettings },
  { label: "Tools", hint: "Git and Node.js", title: "Install tools", description: "Git tracks changes in your projects. Node.js installs AI providers.", Body: () => <RuntimeDownloads /> },
  { label: "AI providers", hint: "Install and sign in", title: "Connect AI providers", description: "Install at least one provider and sign in to it.", Body: ProvidersStep },
  { label: "Project", hint: "Your first folder", title: "Open a project", description: "Pick a folder to start your first conversation in.", Body: ProjectStep },
];
