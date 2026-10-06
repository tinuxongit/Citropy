import { useI18n } from "../lib/i18n.ts";
import { BarChart3, GitBranch, Github, MessagesSquare, Settings } from "lucide-react";

import { AccountMenu } from "./AccountMenu.tsx";
import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { LocalSharing } from "./LocalSharing.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useUsagePeek } from "./UsagePeek.tsx";
import { useState } from "react";

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
  const [accountOpen, setAccountOpen] = useState(false);
  const conversations = { name: "Conversations", icon: MessagesSquare, run: onChat, view: "chat" };
  const code = [
    { name: "Source control", icon: GitBranch, run: onGit, view: "git" },
    { name: "GitHub", icon: Github, run: onGitHub, view: "github" },
  ];
  const usage = { name: "Usage", icon: BarChart3, run: onUsage, view: "usage" };
  const settings = { name: "Settings", icon: Settings, run: onSettings, view: "settings" };
  const button = ({ name, icon: Icon, run, view }: typeof conversations) => (
    <button
      type="button"
      className="strip-action"
      data-view={view}
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
      <div className="navigation-strip-brand" aria-hidden="true" />
      <SelectionHighlight value={activeView} layout={String(accountOpen)} selector='.strip-action[aria-current="page"] > .strip-action-face' />
      {button(conversations)}
      {code.map(button)}
      <div className="navigation-strip-end">
        <AppUpdateControl variant="strip" />
        <AccountMenu open={accountOpen} onOpenChange={setAccountOpen}>
          {button(usage)}
          <LocalSharing />
          {button(settings)}
        </AccountMenu>
      </div>
      {usagePeek.card}
    </nav>
  );
}
