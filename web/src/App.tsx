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
  useRef,
  useState,
  useSyncExternalStore,
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
import { SlidingPanel } from "./components/SlidingPanel.tsx";
import { StageBackdrop } from "./components/StageBackdrop.tsx";
import { Toasts } from "./components/Toasts.tsx";
import { ConfirmationDialog } from "./components/ConfirmationDialog.tsx";
import { RemoteFolderDialog } from "./components/RemoteFolderDialog.tsx";
import type { NotificationTarget } from "../../shared/protocol.ts";
import { Welcome } from "./components/Welcome.tsx";
import {
  useApp,
  viewportWidth,
  selectThread,
  toggleInspector,
  toggleSidebar,
} from "./lib/store.ts";
import { send } from "./lib/socket.ts";
import { useUiSounds } from "./lib/use-ui-sounds.ts";
import { chooseWorkspace, closeTab, createThread, reopenClosedTab, showNextTab } from "./lib/actions.ts";
import { reportError } from "./lib/api.ts";
import { useGitHub } from "./lib/use-github.ts";

const NARROW_VIEWPORT = 720;
const INSPECTOR_MIN_WIDTH = 260;
const CONVERSATION_MIN_WIDTH = 360;

const subscribeResize = (onChange: () => void) => {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
};

const GitHub = lazy(() => import("./components/github/GitHub.tsx").then((module) => ({ default: module.GitHub })));
const GitManager = lazy(() => import("./components/GitManager.tsx").then((module) => ({ default: module.GitManager })));
const Settings = lazy(() => import("./components/Settings.tsx").then((module) => ({ default: module.Settings })));
const UsageView = lazy(() => import("./components/UsageView.tsx").then((module) => ({ default: module.UsageView })));

export function App() {
  const { activeId: environment } = useEnvironments();
  const requestedView = useApp((state) => state.activeView);
  const view = useDeferredValue(requestedView);
  const setView = (activeView: typeof view) => useApp.setState({ activeView });
  const [settingsSection, setSettingsSection] = useState("General");
  const [sectionSidebarOpen, setSectionSidebarOpen] = useState(
    viewportWidth() > NARROW_VIEWPORT,
  );
  const newThreadProvider = useApp((state) => state.newThreadProvider);
  const sidebarOpen = useApp((state) => state.sidebarOpen);
  const narrow = useSyncExternalStore(subscribeResize, () => viewportWidth() <= NARROW_VIEWPORT);
  const stageBackground = useApp((state) => state.stageBackground);
  const inspectorOpen = useApp((state) => state.inspectorOpen);
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
    if (!panelsShown || !sidebarOpen || !inspectorOpen || viewportWidth() <= NARROW_VIEWPORT) return;
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

  const openView = (next: typeof view) => {
    if (next !== "chat") useApp.setState({ readingThreadId: null });
    setView(next);
    if (next === "chat") {
      if (viewportWidth() <= NARROW_VIEWPORT && useApp.getState().sidebarOpen)
        toggleSidebar();
    } else {
      setSectionSidebarOpen(viewportWidth() > NARROW_VIEWPORT);
    }
  };
  const toggleNavigation = () => {
    if (view === "chat") toggleSidebar();
    else setSectionSidebarOpen((open) => !open);
  };
  const closeSectionSidebarOnNarrow = () => {
    if (viewportWidth() <= NARROW_VIEWPORT) setSectionSidebarOpen(false);
  };
  const openSettings = () => {
    setSettingsSection("General");
    openView("settings");
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
    openView(target.view);
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
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if ((key === "," || key === "o") && !event.altKey && !event.shiftKey) {
        // Leave text fields and embedded terminals alone; their own keys win.
        if (inTextEntry(event.target)) return;
        event.preventDefault();
        if (event.repeat) return;
        if (key === ",") openSettings();
        else chooseWorkspace();
      } else if (key === "b") {
        event.preventDefault();
        if (view === "chat") toggleSidebar();
        else setSectionSidebarOpen((open) => !open);
      } else if (key === "j") {
        event.preventDefault();
        setView("chat");
        toggleInspector();
      } else if (key === "k" && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        setView("chat");
        if (!useApp.getState().sidebarOpen) toggleSidebar();
        useApp.setState({ threadSearchFocusPending: true });
      } else if (key === "n" && !event.shiftKey) {
        event.preventDefault();
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
      data-composer={view === "chat" && hasProject && hasActiveThread}
      data-section={view !== "chat" && !backgroundEverywhere || undefined}
      data-backdrop={stageBackground !== "default" ? stageBackground : undefined}
      style={{
        ...Object.fromEntries(
          Object.entries(panelWidths).map(([panel, width]) => [
            `--${panel}-width`,
            `${Math.round((width * uiScale) / 100)}px`,
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
        <main className="stage">
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
            ) : hasProject && activeThreadId ? (
              <Fragment key={`${environment}:${activeThreadId}`}>
                <Conversation />
                <ThreadDetailsPanel />
                <Composer
                  onUsage={() => openView("usage")}
                  onShell={openNotification}
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
      </div>
      <AnimatePresence>{newThreadProvider && (
        <NewConversation key={`${environment}:${activeProjectId}:${newThreadProvider}`} />
      )}</AnimatePresence>
      <ConfirmationDialog />
      <RemoteFolderDialog />
      <LinkActions />
      <Toasts onOpen={openNotification} />
      <WhatsNew />
      <DevTriggers />
    </div>
  );
}
