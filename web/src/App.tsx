import { LinkActions } from "./components/LinkActions.tsx";
import { RemoteConnectionBanner } from "./components/EnvironmentSettings.tsx";
import { environmentStorage, selectEnvironment, useEnvironments } from "./lib/environment.ts";
import { AnimatePresence } from "motion/react";
import { NewConversation } from "./components/NewConversation.tsx";
import {
  Fragment,
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useDrawerGestures } from "./lib/use-drawer-gesture.ts";
import { Titlebar } from "./components/Titlebar.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { NavigationStrip } from "./components/NavigationStrip.tsx";
import { Conversation } from "./components/Conversation.tsx";
import { Composer } from "./components/Composer.tsx";
import { ThreadDetailsPanel } from "./components/thread-details/ThreadDetails.tsx";
import { Inspector } from "./components/Inspector.tsx";
import { DevTriggers } from "./components/DevTriggers.tsx";
import { WhatsNew } from "./components/WhatsNew.tsx";
import { SetupGuide } from "./components/setup/SetupGuide.tsx";
import { SlidingPanel } from "./components/SlidingPanel.tsx";
import { StageBackdrop } from "./components/StageBackdrop.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { ConfirmationDialog } from "./components/ConfirmationDialog.tsx";
import { RemoteFolderDialog } from "./components/RemoteFolderDialog.tsx";
import type { NotificationTarget } from "../../shared/protocol.ts";
import { Welcome } from "./components/Welcome.tsx";
import { BotRoster } from "./components/bots/BotRoster.tsx";
import { BotPanel } from "./components/bots/BotPanel.tsx";
import { BotsEmpty } from "./components/bots/BotsEmpty.tsx";
import { NewChatDialog } from "./components/bots/NewChatDialog.tsx";
import { orderedRoster, rosterItem } from "./lib/roster.ts";
import { visitNextEntry, visitPreviousEntry } from "./lib/roster-history.ts";
import { inBotsView } from "../../shared/bots.ts";
import { openNewBotChat } from "./lib/bots.ts";
import { openChatFind } from "./lib/find-in-chat.ts";
import {
  useApp,
  selectRosterEntry,
  selectThread,
  toggleBotPanel,
  toggleInspector,
  toggleSidebar,
  panelWidthValue,
  type PanelId,
} from "./lib/store.ts";
import { isNarrowViewport, useNarrowViewport } from "./lib/use-narrow-viewport.ts";
import { send } from "./lib/socket.ts";
import { useUiSounds } from "./lib/use-ui-sounds.ts";
import { chooseWorkspace, closeTab, createThread, reopenClosedTab, showNextTab } from "./lib/actions.ts";
import { reportError } from "./lib/api.ts";
import { useGitHub } from "./lib/use-github.ts";
import { BrowserGuests } from "./components/BrowserGuests.tsx";
import { transitionView, viewShown } from "./lib/view-transition.ts";
import { VIEW_MODULES } from "./lib/view-modules.ts";
import { BrowserTakeover } from "./components/BrowserTakeover.tsx";

const INSPECTOR_MIN_WIDTH = 260;
const CONVERSATION_MIN_WIDTH = 360;

const GitHub = lazy(() => VIEW_MODULES.github().then((module) => ({ default: module.GitHub })));
const GitManager = lazy(() => VIEW_MODULES.git().then((module) => ({ default: module.GitManager })));
const Settings = lazy(() => VIEW_MODULES.settings().then((module) => ({ default: module.Settings })));
const UsageView = lazy(() => VIEW_MODULES.usage().then((module) => ({ default: module.UsageView })));

export function App() {
  const { activeId: environment } = useEnvironments();
  const requestedView = useApp((state) => state.activeView);
  const view = useDeferredValue(requestedView);
  const setView = (activeView: typeof view) => useApp.setState({ activeView });
  const [settingsSection, setSettingsSection] = useState("General");
  const [sectionSidebarOpen, setSectionSidebarOpen] = useState(
    !isNarrowViewport(),
  );
  const newThreadProvider = useApp((state) => state.newThreadProvider);
  const newBotChatOpen = useApp((state) => state.newBotChatOpen);
  const sidebarOpen = useApp((state) => state.sidebarOpen);
  const narrow = useNarrowViewport();
  const stageBackground = useApp((state) => state.stageBackground);
  const inspectorOpen = useApp((state) => state.inspectorOpen);
  const botPanelOpen = useApp((state) => state.botPanelOpen && Boolean(rosterItem(state, state.activeRosterId)));
  const panelWidths = useApp((state) => state.panelWidths);
  const uiScale = useApp((state) => state.uiScale);
  const uiTransparency = useApp((state) => state.uiTransparency);
  const opaquePopups = useApp((state) => state.opaquePopups);
  const backgroundEverywhere = useApp((state) => state.backgroundEverywhere);
  const activeThreadId = useApp((state) => state.activeThreadId);
  const activeProjectId = useApp((state) => state.activeProjectId);
  const githubStatus = useGitHub("status", {
    projectId: activeProjectId ?? undefined,
  });
  const hasActiveThread = useApp((state) => Boolean(state.threads[state.activeThreadId ?? ""]));
  const newestThread = useApp((state) => {
    if (state.activeThreadId || !state.activeProjectId) return undefined;
    return state.threadOrder.find((id) => {
      const thread = state.threads[id];
      return thread?.projectId === state.activeProjectId &&
        !thread.parentThreadId && !thread.archived && !thread.snoozedUntil;
    });
  });
  const hasProject = useApp((state) => state.projects.length > 0);
  const panelsShown = view === "chat";
  const conversationShown = view === "chat" || view === "bots";
  const navigationOpen = view === "chat" ? sidebarOpen : sectionSidebarOpen;
  const shellBody = useRef<HTMLDivElement>(null);
  useDrawerGestures(shellBody, {
    left: {
      enabled: true,
      open: navigationOpen,
      setOpen: (open) => {
        if (view !== "chat") setSectionSidebarOpen(open);
        else if (useApp.getState().sidebarOpen !== open) toggleSidebar();
      },
    },
    right: {
      enabled: panelsShown && hasProject,
      open: panelsShown && inspectorOpen,
      setOpen: (open) => { if (useApp.getState().inspectorOpen !== open) toggleInspector(); },
    },
  });
  const openPanels = useRef({ sidebarOpen, inspectorOpen });
  useEffect(() => {
    const previous = openPanels.current;
    openPanels.current = { sidebarOpen, inspectorOpen };
    if (!panelsShown || !sidebarOpen || !inspectorOpen || isNarrowViewport()) return;
    const shell = shellBody.current!.parentElement!;
    const strip = parseFloat(getComputedStyle(shell).paddingLeft);
    const rail = shell.querySelector<HTMLElement>(".rail")!.offsetWidth;
    if (strip + rail + INSPECTOR_MIN_WIDTH + CONVERSATION_MIN_WIDTH <= shell.clientWidth) return;
    if (previous.inspectorOpen && !previous.sidebarOpen) useApp.setState({ inspectorOpen: false });
    else useApp.setState({ sidebarOpen: false });
  }, [panelsShown, sidebarOpen, inspectorOpen]);
  useUiSounds();

  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      root.toggleAttribute("data-page-hidden", document.hidden);
      root.toggleAttribute("data-window-blurred", !document.hasFocus());
    };
    update();
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", update);
      root.removeAttribute("data-page-hidden");
      root.removeAttribute("data-window-blurred");
    };
  }, []);

  useLayoutEffect(() => viewShown(view), [view]);
  const showView = (next: typeof view) => {
    if (next !== "chat") useApp.setState({ readingThreadId: null });
    setView(next);
    if (next === "chat") {
      if (isNarrowViewport() && useApp.getState().sidebarOpen)
        toggleSidebar();
    } else {
      setSectionSidebarOpen(!isNarrowViewport());
    }
  };
  const openView = (next: typeof view) => transitionView(next, () => showView(next));
  const toggleNavigation = () => {
    if (view === "chat") toggleSidebar();
    else setSectionSidebarOpen((open) => !open);
  };
  const closeSectionSidebarOnNarrow = () => {
    if (isNarrowViewport()) setSectionSidebarOpen(false);
  };
  const openSettings = (open = openView) => {
    setSettingsSection("General");
    open("settings");
  };

  useEffect(() => {
    if (githubStatus.data)
      useApp.setState({ githubAccount: githubStatus.data.account ?? null });
  }, [githubStatus.data]);

  const openNotification = (target: NotificationTarget) => {
    if (target.view === "settings") setSettingsSection(target.section ?? "General");
    const state = useApp.getState();
    if (
      target.projectId &&
      state.projects.some((project) => project.id === target.projectId)
    ) {
      useApp.setState({ activeProjectId: target.projectId });
      environmentStorage.setItem("citropy.project", target.projectId);
    }
    if (target.threadId && state.threads[target.threadId])
      selectThread(target.threadId);
    openView(inBotsView(state.threads[target.threadId ?? ""]) ? "bots" : target.view);
  };

  useEffect(
    () =>
      window.citropyDesktop?.onNotification?.((notification) => {
        void (async () => {
          if (notification.environmentId) await selectEnvironment(notification.environmentId);
          send({ t: "notifications.read", ids: [notification.id] });
          openNotification(notification.target);
        })().catch(reportError);
      }),
    [],
  );

  useEffect(
    () =>
      window.citropyDesktop?.onBrowserSelect((panel) => {
        setView("chat");
        useApp.setState((state) => ({
          activeProjectId: panel.projectId,
          activePanels: { ...state.activePanels, [panel.projectId]: panel.id },
          inspectorOpen: true,
        }));
        if (panel.threadId && useApp.getState().threads[panel.threadId])
          selectThread(panel.threadId);
      }),
    [],
  );

  useEffect(() => {
    if (newestThread) selectThread(newestThread);
  }, [newestThread]);

  useEffect(() => {
    const refresh = () => send({ t: "providers.refresh" });
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  useEffect(() => {
    const inTextEntry = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      // Text fields and embedded terminals keep their own keys, including
      // every contenteditable form via isContentEditable.
      (target.isContentEditable ||
        target.closest(".xterm, textarea, select, input:not([type='checkbox']):not([type='radio'])") !== null);
    const inTerminal = (target: EventTarget | null) => target instanceof HTMLElement && target.closest(".xterm") !== null;
    const showRosterEntry = (event: KeyboardEvent, pick: (shown: string[], current: number) => string | undefined) => {
      const state = useApp.getState();
      const shown = orderedRoster(state).shown.map((entry) => entry.item.id);
      const next = pick(shown, shown.indexOf(state.activeRosterId ?? ""));
      if (!next) return;
      event.preventDefault();
      selectRosterEntry(next);
    };
    const stepRoster = (event: KeyboardEvent, step: number) =>
      showRosterEntry(event, (shown, current) => shown[(current + step + shown.length) % shown.length]);
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (view === "bots" && event.altKey && !mod && !event.shiftKey && (key === "arrowup" || key === "arrowdown") && !inTextEntry(event.target)) {
        stepRoster(event, key === "arrowup" ? -1 : 1);
        return;
      }
      if (!mod) return;
      if ((key === "," || key === "o") && !event.altKey && !event.shiftKey) {
        // Leave text fields and embedded terminals alone; their own keys win.
        if (inTextEntry(event.target)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (key === ",") openSettings(showView);
        else chooseWorkspace();
      } else if (view === "bots" && (event.shiftKey ? event.code === "Comma" : event.altKey && key === "b")) {
        event.preventDefault();
        toggleBotPanel();
      } else if (key === "b") {
        event.preventDefault();
        if (view === "chat") toggleSidebar();
        else setSectionSidebarOpen((open) => !open);
      } else if (key === "j") {
        event.preventDefault();
        setView("chat");
        toggleInspector();
      } else if (view === "bots" && !event.altKey && (event.shiftKey ? key === "f" : key === "k")) {
        event.preventDefault();
        setSectionSidebarOpen(true);
        useApp.setState({ searchFocusPending: true });
      } else if (key === "f" && !event.altKey && !event.shiftKey && !inTerminal(event.target) && (view === "chat" || view === "bots") && useApp.getState().activeThreadId) {
        event.preventDefault();
        openChatFind();
      } else if (key === "k" && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        setView("chat");
        if (!useApp.getState().sidebarOpen) toggleSidebar();
        useApp.setState({ searchFocusPending: true });
      } else if ((key === "i" || key === "l") && !event.altKey && !event.shiftKey) {
        const composer = document.querySelector<HTMLElement>(".stage .composer-input");
        if (!composer || (inTextEntry(event.target) && event.target !== composer)) return;
        event.preventDefault();
        composer.focus();
      } else if (view === "bots" && !event.altKey && !event.shiftKey && (key === "[" || key === "]")) {
        event.preventDefault();
        if (key === "[") visitPreviousEntry();
        else visitNextEntry();
      } else if (view === "bots" && event.ctrlKey && key === "tab") {
        stepRoster(event, event.shiftKey ? -1 : 1);
      } else if (view === "bots" && !event.altKey && /^[1-9]$/.test(key) && !inTextEntry(event.target)) {
        showRosterEntry(event, (shown) => shown[Number(key) - 1]);
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        if (view === "bots") {
          openNewBotChat();
          return;
        }
        setView("chat");
        createThread();
      } else if (view === "chat" && !event.altKey && !inTerminal(event.target) && (key === "w" || key === "t" || key === "tab")) {
        const activeThreadId = useApp.getState().activeThreadId;
        if (key === "w" && !event.shiftKey && activeThreadId) closeTab(activeThreadId);
        else if (key === "t" && event.shiftKey) reopenClosedTab();
        else if (key === "tab") showNextTab(event.shiftKey ? -1 : 1);
        else return;
        event.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  return (
    <div
      className="shell"
      data-inspector={inspectorOpen && panelsShown}
      data-composer={conversationShown && hasProject && hasActiveThread}
      data-section={view !== "chat" && !backgroundEverywhere || undefined}
      data-backdrop={stageBackground !== "default" ? stageBackground : undefined}
      style={{
        ...Object.fromEntries(
          Object.entries(panelWidths).map(([panel, width]) => [
            `--${panel}-width`,
            panelWidthValue(panel as PanelId, width, uiScale),
          ]),
        ),
        "--ui-alpha": 1 - uiTransparency / 100,
        "--popup-floor": opaquePopups ? 1 : 0.95,
      } as CSSProperties}
    >
      <StageBackdrop />
      <NavigationStrip
        activeView={view}
        onChat={() => (view === "chat" ? toggleSidebar() : openView("chat"))}
        onBots={() => (view === "bots" ? toggleNavigation() : openView("bots"))}
        onGit={() => (view === "git" ? toggleNavigation() : openView("git"))}
        onGitHub={() => (view === "github" ? toggleNavigation() : openView("github"))}
        onSettings={() => (view === "settings" ? toggleNavigation() : openSettings())}
        onUsage={() => (view === "usage" ? toggleNavigation() : openView("usage"))}
        onNotification={openNotification}
      />
      <Titlebar
        view={view}
        sidebarOpen={navigationOpen}
        sidebarToggle={narrow}
        onToggleSidebar={toggleNavigation}
      />
      <RemoteConnectionBanner />
      <div className="shell-body" ref={shellBody}>
        {(
          <button
            className="sidebar-scrim"
            type="button"
            data-open={navigationOpen}
            tabIndex={navigationOpen ? undefined : -1}
            aria-hidden={!navigationOpen || undefined}
            aria-label="Close navigation"
            onClick={toggleNavigation}
          />
        )}
        {view === "chat" && <SlidingPanel open={sidebarOpen} side="left" keepMounted pauseHidden>
          <Sidebar
            onConversation={() => openView("chat")}
          />
        </SlidingPanel>}
        {view === "bots" && <SlidingPanel open={sectionSidebarOpen} side="left" keepMounted pauseHidden>
          <BotRoster onOpen={closeSectionSidebarOnNarrow} />
        </SlidingPanel>}
        <main className="stage" data-view={view}>
          <Suspense
            fallback={
              <div className="pane-empty" role="status">Loading…</div>
            }
          >
            {view === "usage" ? (
              <UsageView
                key={environment}
                sidebarOpen={sectionSidebarOpen}
                onNavigate={closeSectionSidebarOnNarrow}
              />
            ) : view === "git" ? (
              <GitManager
                key={`${environment}:${activeProjectId}:${activeThreadId}`}
                sidebarOpen={sectionSidebarOpen}
                onNavigate={closeSectionSidebarOnNarrow}
              />
            ) : view === "github" ? (
              <GitHub
                status={githubStatus}
                onGit={() => openView("git")}
                key={`${environment}:${activeProjectId}`}
                sidebarOpen={sectionSidebarOpen}
                onNavigate={closeSectionSidebarOnNarrow}
                onBack={() => openView("chat")}
              />
            ) : view === "settings" ? (
              <Settings
                initialSection={settingsSection}
                sidebarOpen={sectionSidebarOpen}
                onNavigate={closeSectionSidebarOnNarrow}
              />
            ) : view === "bots" && !activeThreadId ? (
              <BotsEmpty />
            ) : hasProject && activeThreadId ? (
              <Fragment key={`${environment}:${activeThreadId}`}>
                <Conversation />
                <BrowserTakeover />
                {view === "chat" && <ThreadDetailsPanel />}
                <Composer
                  onUsage={() => openView("usage")}
                  onSkills={() => {
                    setSettingsSection("Skills");
                    openView("settings");
                  }}
                />
              </Fragment>
            ) : (
              <Welcome key={environment} />
            )}
          </Suspense>
        </main>
        {hasProject && <SlidingPanel open={inspectorOpen && panelsShown} side="right" keepMounted>
          <Inspector key={environment} visible={inspectorOpen && panelsShown} />
        </SlidingPanel>}
        {view === "bots" && <SlidingPanel open={botPanelOpen} side="right" keepMounted>
          <BotPanel />
        </SlidingPanel>}
      </div>
      <AnimatePresence>{newThreadProvider && (
        <NewConversation key={`${environment}:${activeProjectId}:${newThreadProvider}`} />
      )}</AnimatePresence>
      <AnimatePresence>{newBotChatOpen && <NewChatDialog key={environment} />}</AnimatePresence>
      <ConfirmationDialog />
      <RemoteFolderDialog />
      <LinkActions />
      <Toasts onOpen={openNotification} />
      <WhatsNew
        onOpenSettings={(section) => {
          setSettingsSection(section);
          openView("settings");
        }}
      />
      <SetupGuide />
      <DevTriggers />
      {window.citropyDesktop && <BrowserGuests />}
    </div>
  );
}
