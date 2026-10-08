
import { AccountMenu } from "./AccountMenu.tsx";
import { AgentsPanel } from "./AgentsPanel.tsx";
import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { GitHubIcon, GitIcon } from "./BrandIcon.tsx";
import { ConversationsIcon } from "./ConversationsIcon.tsx";
import { NotificationCenter } from "./NotificationCenter.tsx";
import { SettingsIcon } from "./SettingsIcon.tsx";
import { UsageIcon } from "./UsageIcon.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useUsagePeek } from "./UsagePeek.tsx";
import { useState, type ComponentType } from "react";
import { useEnvironments } from "../lib/environment.ts";
import type { NotificationTarget } from "../../../shared/protocol.ts";

interface StripButton {
  name: string;
  icon: ComponentType<{ size?: number }>;
  run: () => void;
  view: string;
}

export function NavigationStrip({
  onChat,
  onGit,
  onGitHub,
  onSettings,
  onUsage,
  onNotification,
  activeView,
}: {
  onChat: () => void;
  onGit: () => void;
  onGitHub: () => void;
  onSettings: () => void;
  onUsage: () => void;
  onNotification: (target: NotificationTarget) => void;
  activeView: string;
}) {
  const usagePeek = useUsagePeek("right");
  const { activeId: environment } = useEnvironments();
  const [accountOpen, setAccountOpen] = useState(false);
  const conversations: StripButton = { name: "Conversations", icon: ConversationsIcon, run: onChat, view: "chat" };
  const code = [
    { name: "Source control", icon: GitIcon, run: onGit, view: "git" },
    { name: "GitHub", icon: GitHubIcon, run: onGitHub, view: "github" },
  ];
  const usage = { name: "Usage", icon: UsageIcon, run: onUsage, view: "usage" };
  const settings = { name: "Settings", icon: SettingsIcon, run: onSettings, view: "settings" };
  const button = ({ name, icon: Icon, run, view }: StripButton) => (
    <button
      type="button"
      className="strip-action"
      data-view={view}
      aria-current={activeView === view ? "page" : undefined}
      key={view}
      onClick={() => { usagePeek.hide(); run(); }}
      aria-label={name}
      title={view === "usage" ? undefined : name}
      aria-describedby={view === "usage" ? usagePeek.describedBy : undefined}
      {...(view === "usage" ? usagePeek.bind : {})}
    >
      <span className="strip-action-face"><Icon size={18} /></span>
    </button>
  );
  return (
    <nav className="navigation-strip sliding-selection" aria-label="Workspace navigation">
      <div className="navigation-strip-brand" aria-hidden="true" />
      <SelectionHighlight value={activeView} layout={String(accountOpen)} selector='.strip-action[aria-current="page"] > .strip-action-face' />
      {button(conversations)}
      {code.map(button)}
      <div className="navigation-strip-group" key={environment}>
        <AgentsPanel />
        <NotificationCenter onOpen={onNotification} />
      </div>
      <div className="navigation-strip-end">
        <AppUpdateControl variant="strip" />
        <AccountMenu open={accountOpen} onOpenChange={setAccountOpen}>
          {button(usage)}
          {button(settings)}
        </AccountMenu>
      </div>
      {usagePeek.card}
    </nav>
  );
}
