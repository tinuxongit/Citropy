import { LinkActions } from "./components/LinkActions.tsx";
import { RemoteConnectionBanner } from "./components/EnvironmentSettings.tsx";
import { environmentStorage, selectEnvironment, useEnvironments } from "./lib/environment.ts";
import { AnimatePresence } from "motion/react";
import { NewConversation } from "./components/NewConversation.tsx";
import {
  Fragment,
  Suspense,
  useDeferredValue,
  useEffect,
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
import { ChatWelcome, Welcome } from "./components/Welcome.tsx";
import { BotRoster } from "./components/bots/BotRoster.tsx";
import { BotPanel } from "./components/bots/BotPanel.tsx";
import { BotsEmpty } from "./components/bots/BotsEmpty.tsx";
import { NewChatDialog } from "./components/bots/NewChatDialog.tsx";
import { orderedRoster, rosterItem } from "./lib/roster.ts";
import { visitNextEntry, visitPreviousEntry } from "./lib/roster-history.ts";
import { openNewBotChat } from "./lib/bots.ts";
import { openChatFind } from "./lib/find-in-chat.ts";
import {
  useApp,
  selectRosterEntry,
  selectThread,
  toggleBotPanel,
  toggleInspector,
  toggleSidebar,
  threadView,
  panelWidthValue,
  type PanelId,
} from "./lib/store.ts";
import { isNarrowViewport, useNarrowViewport } from "./lib/use-narrow-viewport.ts";
import { send } from "./lib/socket.ts";
import { useUiSounds } from "./lib/use-ui-sounds.ts";
import { useForgivingPresses } from "./lib/use-forgiving-presses.ts";
import { chooseWorkspace, createChat, createThread } from "./lib/actions.ts";
import { reportError } from "./lib/api.ts";
import { useGitHub } from "./lib/use-github.ts";
import { BrowserGuests } from "./components/BrowserGuests.tsx";
import { lazyView } from "./lib/view-modules.ts";
import { BrowserTakeover } from "./components/BrowserTakeover.tsx";

const INSPECTOR_MIN_WIDTH = 260;
const CONVERSATION_MIN_WIDTH = 360;

const GitHub = lazyView("github", (module) => module.GitHub);
const GitManager = lazyView("git", (module) => module.GitManager);
const Settings = lazyView("settings", (module) => module.Settings);
const UsageView = lazyView("usage", (module) => module.UsageView);

export function App() {
  const { activeId: environment } = useEnvironments();
  const requestedView = useApp((state) => state.activeView);
  const view = useDeferredValue(requestedView);
  const setView = (activeView: typeof view) => useApp.setState({ activeView });
  const [settingsSection, setSettingsSection] = useState<string | null>(null);
  const [sectionSidebarOpen, setSectionSidebarOpen] = useState(!isNarrowViewport());
  const newThreadProvider = useApp((state) => state.newThreadProvider);
  const newBotChatOpen = useApp((state) => state.newBotChatOpen);
  const sidebarOpen = useApp((state) => state.sidebarOpen);
  const narrow = useNarrowViewport();
  const stageBackground = useApp((state) => state.stageBackground);
  const inspectorOpen = useApp((state) => state.inspectorOpen);
  const botPanelOpen = useApp(
    (state) => state.botPanelOpen && Boolean(rosterItem(state, state.activeRosterId)),
  );
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
    if (state.activeView !== "chat" || state.activeThreadId || !state.activeProjectId)
      return undefined;
    return state.threadOrder.find((id) => {
      const thread = state.threads[id];
      return (
        thread?.projectId === state.activeProjectId &&
        !thread.parentThreadId &&
        !thread.archived &&
        !thread.snoozedUntil
      );
    });
  });
  // An open chat counts as a workspace even when no project is open.
  const hasProject = useApp(
    (state) =>
      state.projects.length > 0 || Boolean(state.threads[state.activeThreadId ?? ""]?.chat),
  );
  // Code and Chat share the sidebar and the conversation layout.
  const conversationView = view === "chat" || view === "chats";
  const panelsShown = view === "chat" || (view === "chats" && hasActiveThread);
  const conversationShown = conversationView || view === "bots";
  const hasBots = useApp((state) => Object.keys(state.bots).length > 0);
  // The bot roster stays hidden until the first bot exists; the empty state covers creation.
  const rosterHidden = view === "bots" && !hasBots;
  const navigationOpen = conversationView ? sidebarOpen : sectionSidebarOpen && !rosterHidden;
  const shellBody = useRef<HTMLDivElement>(null);
  useDrawerGestures(shellBody, {
    left: {
      enabled: true,
      open: navigationOpen,
      setOpen: (open) => {
        if (!conversationView) setSectionSidebarOpen(open);
        else if (useApp.getState().sidebarOpen !== open) toggleSidebar();
      },
    },
    right: {
      enabled: panelsShown && hasProject,
      open: panelsShown && inspectorOpen,
      setOpen: (open) => {
        if (useApp.getState().inspectorOpen !== open) toggleInspector();
      },
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
  useForgivingPresses();

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

  const openView = (next: typeof view) => {
    if (next !== "chat") useApp.setState({ readingThreadId: null });
    setView(next);
    if (next === "chat" || next === "chats") {
      if (isNarrowViewport() && useApp.getState().sidebarOpen) toggleSidebar();
    } else {
      setSectionSidebarOpen(!isNarrowViewport());
    }
  };
  const toggleNavigation = () => {
    if (conversationView) toggleSidebar();
    else setSectionSidebarOpen((open) => !open);
  };
  const closeSectionSidebarOnNarrow = () => {
    if (isNarrowViewport()) setSectionSidebarOpen(false);
  };
  const openSettings = (section = "General") => setSettingsSection(section);

  useEffect(() => {
    if (githubStatus.data) useApp.setState({ githubAccount: githubStatus.data.account ?? null });
  }, [githubStatus.data]);

  const openNotification = (target: NotificationTarget) => {
    const state = useApp.getState();
    const thread = state.threads[target.threadId ?? ""];
    // Chats live in a workspace the project list leaves out.
    if (
      target.projectId &&
      (state.projects.some((project) => project.id === target.projectId) ||
        thread?.projectId === target.projectId)
    ) {
      useApp.setState({ activeProjectId: target.projectId });
      environmentStorage.setItem("citropy.project", target.projectId);
    }
    if (thread) selectThread(thread.id);
    const shown = threadView(thread);
    if (target.view === "settings") openSettings(target.section);
    else openView(shown === "chat" ? target.view : shown);
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
      useApp.subscribe((state, previous) => {
        if (state.readingThreadId !== previous.readingThreadId)
          window.citropyDesktop?.readingThread?.(state.readingThreadId);
      }),
    [],
  );

  useEffect(
    () =>
      window.citropyDesktop?.onBrowserSelect((panel) => {
        setView(useApp.getState().threads[panel.threadId ?? ""]?.chat ? "chats" : "chat");
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
        target.closest(
          ".xterm, textarea, select, input:not([type='checkbox']):not([type='radio'])",
        ) !== null);
    const inTerminal = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest(".xterm") !== null;
    const showRosterEntry = (
      event: KeyboardEvent,
      pick: (shown: string[], current: number) => string | undefined,
    ) => {
      const state = useApp.getState();
      const shown = orderedRoster(state).shown.map((entry) => entry.item.id);
      const next = pick(shown, shown.indexOf(state.activeRosterId ?? ""));
      if (!next) return;
      event.preventDefault();
      selectRosterEntry(next);
    };
    const stepRoster = (event: KeyboardEvent, step: number) =>
      showRosterEntry(
        event,
        (shown, current) => shown[(current + step + shown.length) % shown.length],
      );
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (
        view === "bots" &&
        event.altKey &&
        !mod &&
        !event.shiftKey &&
        (key === "arrowup" || key === "arrowdown") &&
        !inTextEntry(event.target)
      ) {
        stepRoster(event, key === "arrowup" ? -1 : 1);
        return;
      }
      if (!mod) return;
      if ((key === "," || key === "o") && !event.altKey && !event.shiftKey) {
        // Leave text fields and embedded terminals alone; their own keys win.
        if (inTextEntry(event.target)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (key === ",") setSettingsSection((section) => section ?? "General");
        else chooseWorkspace();
      } else if (
        view === "bots" &&
        (event.shiftKey ? event.code === "Comma" : event.altKey && key === "b")
      ) {
        event.preventDefault();
        toggleBotPanel();
      } else if (key === "b") {
        event.preventDefault();
        if (conversationView) toggleSidebar();
        else setSectionSidebarOpen((open) => !open);
      } else if (key === "j") {
        event.preventDefault();
        if (view !== "chats") setView("chat");
        toggleInspector();
      } else if (view === "bots" && !event.altKey && (event.shiftKey ? key === "f" : key === "k")) {
        event.preventDefault();
        setSectionSidebarOpen(true);
        useApp.setState({ searchFocusPending: true });
      } else if (
        key === "f" &&
        !event.altKey &&
        !event.shiftKey &&
        !inTerminal(event.target) &&
        (conversationView || view === "bots") &&
        useApp.getState().activeThreadId
      ) {
        event.preventDefault();
        openChatFind();
      } else if (key === "k" && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (view !== "chats") setView("chat");
        if (!useApp.getState().sidebarOpen) toggleSidebar();
        useApp.setState({ searchFocusPending: true });
      } else if ((key === "i" || key === "l") && !event.altKey && !event.shiftKey) {
        const composer = document.querySelector<HTMLElement>(".stage .composer-input");
        if (!composer || (inTextEntry(event.target) && event.target !== composer)) return;
        event.preventDefault();
        composer.focus();
      } else if (
        view === "bots" &&
        !event.altKey &&
        !event.shiftKey &&
        (key === "[" || key === "]")
      ) {
        event.preventDefault();
        if (key === "[") visitPreviousEntry();
        else visitNextEntry();
      } else if (view === "bots" && event.ctrlKey && key === "tab") {
        stepRoster(event, event.shiftKey ? -1 : 1);
      } else if (
        view === "bots" &&
        !event.altKey &&
        /^[1-9]$/.test(key) &&
        !inTextEntry(event.target)
      ) {
        showRosterEntry(event, (shown) => shown[Number(key) - 1]);
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault();
        if (view === "bots") {
          openNewBotChat();
          return;
        }
        if (view === "chats") return void createChat();
        setView("chat");
        createThread();
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
      data-section={(!conversationView && !backgroundEverywhere) || undefined}
      data-backdrop={stageBackground !== "default" ? stageBackground : undefined}
      style={
        {
          ...Object.fromEntries(
            Object.entries(panelWidths).map(([panel, width]) => [
              `--${panel}-width`,
              panelWidthValue(panel as PanelId, width, uiScale),
            ]),
          ),
          "--ui-alpha": 1 - uiTransparency / 100,
          "--popup-floor": opaquePopups ? 1 : 0.95,
        } as CSSProperties
      }
    >
      <StageBackdrop />
      <NavigationStrip
        activeView={view}
        onChat={() => (view === "chats" ? toggleSidebar() : openView("chats"))}
        onCode={() => (view === "chat" ? toggleSidebar() : openView("chat"))}
        onBots={() => (view === "bots" ? toggleNavigation() : openView("bots"))}
        onSettings={() => openSettings()}
        onUsage={() => (view === "usage" ? toggleNavigation() : openView("usage"))}
        onNotification={openNotification}
      />
      <Titlebar
        view={view}
        sidebarOpen={navigationOpen}
        sidebarToggle={narrow && !rosterHidden}
        onToggleSidebar={toggleNavigation}
      />
      <RemoteConnectionBanner />
      <div className="shell-body" ref={shellBody}>
        {
          <button
            className="sidebar-scrim"
            type="button"
            data-open={navigationOpen}
            tabIndex={navigationOpen ? undefined : -1}
            aria-hidden={!navigationOpen || undefined}
            aria-label="Close navigation"
            onClick={toggleNavigation}
          />
        }
        {conversationView && (
          <SlidingPanel open={sidebarOpen} side="left" keepMounted pauseHidden>
            <Sidebar
              key={view}
              section={view === "chats" ? "chats" : "code"}
              onConversation={() => openView(view)}
              onView={openView}
            />
          </SlidingPanel>
        )}
        {view === "bots" && (
          <SlidingPanel open={navigationOpen} side="left" keepMounted pauseHidden>
            <BotRoster onOpen={closeSectionSidebarOnNarrow} />
          </SlidingPanel>
        )}
        <main className="stage" data-view={view}>
          <Suspense
            fallback={
              <div className="pane-empty" role="status">
                Loading…
              </div>
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
            ) : view === "bots" && !activeThreadId ? (
              <BotsEmpty />
            ) : view === "chats" && !activeThreadId ? (
              <ChatWelcome />
            ) : hasProject && activeThreadId ? (
              <Fragment key={`${environment}:${activeThreadId}`}>
                <Conversation />
                <BrowserTakeover />
                {view === "chat" && <ThreadDetailsPanel />}
                <Composer
                  onUsage={() => openView("usage")}
                  onSkills={() => openSettings("Skills")}
                />
              </Fragment>
            ) : (
              <Welcome key={environment} />
            )}
          </Suspense>
        </main>
        {hasProject && (
          <SlidingPanel open={inspectorOpen && panelsShown} side="right" keepMounted>
            <Inspector key={environment} visible={inspectorOpen && panelsShown} />
          </SlidingPanel>
        )}
        {view === "bots" && (
          <SlidingPanel open={botPanelOpen} side="right" keepMounted>
            <BotPanel />
          </SlidingPanel>
        )}
      </div>
      <AnimatePresence>
        {newThreadProvider && (
          <NewConversation key={`${environment}:${activeProjectId}:${newThreadProvider}`} />
        )}
      </AnimatePresence>
      <AnimatePresence>{newBotChatOpen && <NewChatDialog key={environment} />}</AnimatePresence>
      <ConfirmationDialog />
      <RemoteFolderDialog />
      <LinkActions />
      <Toasts onOpen={openNotification} />
      <AnimatePresence>
        {settingsSection && (
          <Suspense key="settings" fallback={null}>
            <Settings initialSection={settingsSection} onClose={() => setSettingsSection(null)} />
          </Suspense>
        )}
      </AnimatePresence>
      <WhatsNew onOpenSettings={openSettings} />
      <SetupGuide />
      <DevTriggers />
      {window.citropyDesktop && <BrowserGuests />}
    </div>
  );
}
