import { AccountMenu } from "./AccountMenu.tsx";
import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { ConversationsIcon } from "./icons/ConversationsIcon.tsx";
import { BotsIcon } from "./icons/bots.tsx";
import { CodeSectionIcon } from "./icons/editing.tsx";
import { NotificationCenter } from "./NotificationCenter.tsx";
import { SettingsIcon } from "./icons/SettingsIcon.tsx";
import { UsageIcon } from "./icons/UsageIcon.tsx";
import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useUsagePeek } from "./UsagePeek.tsx";
import { useState, type ComponentType } from "react";
import { useEnvironments } from "../lib/environment.ts";
import { useNarrowViewport } from "../lib/use-narrow-viewport.ts";
import { preloadView } from "../lib/view-modules.ts";
import type { NotificationTarget } from "../../../shared/protocol.ts";

interface StripButton {
  name: string;
  icon: ComponentType<{ size?: number }>;
  run: () => void;
  view: string;
  desktopOnly?: boolean;
}

export function NavigationStrip({
  onChat,
  onCode,
  onBots,
  onSettings,
  onUsage,
  onNotification,
  activeView,
}: {
  onChat: () => void;
  onCode: () => void;
  onBots: () => void;
  onSettings: () => void;
  onUsage: () => void;
  onNotification: (target: NotificationTarget) => void;
  activeView: string;
}) {
  const usagePeek = useUsagePeek();
  const { activeId: environment } = useEnvironments();
  const [accountOpen, setAccountOpen] = useState(true);
  const narrow = useNarrowViewport();
  const chat: StripButton = { name: "Chat", icon: ConversationsIcon, run: onChat, view: "chats" };
  const code: StripButton = { name: "Code", icon: CodeSectionIcon, run: onCode, view: "chat" };
  const bots: StripButton = { name: "Bots", icon: BotsIcon, run: onBots, view: "bots" };
  const usage: StripButton = {
    name: "Usage",
    icon: UsageIcon,
    run: onUsage,
    view: "usage",
    desktopOnly: true,
  };
  const settings = { name: "Settings", icon: SettingsIcon, run: onSettings, view: "settings" };
  const button = ({ name, icon: Icon, run, view, desktopOnly }: StripButton) =>
    narrow && desktopOnly ? null : (
      <button
        type="button"
        className="strip-action"
        data-view={view}
        aria-current={activeView === view ? "page" : undefined}
        key={view}
        onClick={() => {
          usagePeek.hide();
          run();
        }}
        onPointerOver={() => preloadView(view)}
        onFocusCapture={() => preloadView(view)}
        aria-label={name}
        title={view === "usage" ? undefined : name}
        aria-describedby={view === "usage" ? usagePeek.describedBy : undefined}
        {...(view === "usage" ? usagePeek.bind : {})}
      >
        <span className="strip-action-face">
          <Icon size={18} />
        </span>
      </button>
    );
  return (
    <nav className="navigation-strip sliding-selection" aria-label="Workspace navigation">
      <div className="navigation-strip-brand" aria-hidden="true" />
      <SelectionHighlight
        value={activeView}
        layout={String(accountOpen)}
        selector='.strip-action[aria-current="page"] > .strip-action-face'
      />
      {button(code)}
      {button(chat)}
      {button(bots)}
      <div className="navigation-strip-end">
        <NotificationCenter onOpen={onNotification} key={environment} />
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
