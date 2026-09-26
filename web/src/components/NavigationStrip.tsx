import { useI18n } from "../lib/i18n.ts";
import { BarChart3, GitBranch, Github, MessagesSquare, Settings } from "lucide-react";

import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useUsagePeek } from "./UsagePeek.tsx";

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
  const usagePeek = useUsagePeek("right");
  const top = [
    { name: "Conversations", icon: MessagesSquare, run: onChat, view: "chat" },
    { name: "Source control", icon: GitBranch, run: onGit, view: "git" },
    { name: "GitHub", icon: Github, run: onGitHub, view: "github" },
  ];
  const button = ({ name, icon: Icon, run, view }: typeof top[number]) => (
    <button
      type="button"
      className="strip-action"
      aria-current={activeView === view ? "page" : undefined}
      key={view}
      onClick={() => { usagePeek.hide(); run(); }}
      aria-label={t(name)}
      title={view === "usage" ? undefined : t(name)}
      aria-describedby={view === "usage" ? usagePeek.describedBy : undefined}
      {...(view === "usage" ? usagePeek.bind : {})}
    >
      <span className="strip-action-face"><Icon size={18} /></span>
    </button>
  );
  return (
    <nav className="navigation-strip sliding-selection" aria-label={t("Workspace navigation")}>
      <SelectionHighlight value={activeView} selector='.strip-action[aria-current="page"] > .strip-action-face' />
      {top.map(button)}
      <div className="navigation-strip-end">
        {button({ name: "Usage", icon: BarChart3, run: onUsage, view: "usage" })}
        <AppUpdateControl variant="strip" />
        {button({ name: "Settings", icon: Settings, run: onSettings, view: "settings" })}
      </div>
      {usagePeek.card}
    </nav>
  );
}
