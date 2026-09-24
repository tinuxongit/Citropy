import { useI18n } from "../lib/i18n.ts";
import { BarChart3, GitBranch, Github, MessagesSquare, Settings } from "lucide-react";

import { AppUpdateControl } from "./AppUpdateControl.tsx";

export function NavigationStrip({
  onChat,
  onGit,
  onGitHub,
  onSettings,
  onUsage,
  activeView,
}: {
  onChat: () => void;
  onGit: () => void;
  onGitHub: () => void;
  onSettings: () => void;
  onUsage: () => void;
  activeView: string;
}) {
  const t = useI18n();
  const top = [
    { name: "Conversations", icon: MessagesSquare, run: onChat, view: "chat" },
    { name: "Source control", icon: GitBranch, run: onGit, view: "git" },
    { name: "GitHub", icon: Github, run: onGitHub, view: "github" },
    { name: "Usage", icon: BarChart3, run: onUsage, view: "usage" },
  ];
  const button = ({ name, icon: Icon, run, view }: typeof top[number]) => (
    <button
      type="button"
      className="strip-action"
      aria-current={activeView === view ? "page" : undefined}
      key={view}
      onClick={run}
      aria-label={t(name)}
      title={t(name)}
    >
      <Icon size={18} />
    </button>
  );
  return (
    <nav className="navigation-strip" aria-label={t("Workspace navigation")}>
      {top.map(button)}
      <div className="navigation-strip-end">
        <AppUpdateControl />
        {button({ name: "Settings", icon: Settings, run: onSettings, view: "settings" })}
      </div>
    </nav>
  );
}
