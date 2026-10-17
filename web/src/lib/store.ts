import { environmentStorage } from "./environment.ts";
import { defaultAssistance } from "../../../shared/assistance.ts";
import type { Project } from "../../../shared/protocol.ts";
import { useApp, readOffline, type AppState, type Confirmation } from "./app-state.ts";
import { trimHistories } from "./history-cache.ts";
import type { EnvironmentSlice } from "./live-environments.ts";
import { inBotsView } from "../../../shared/bots.ts";

export { useApp } from "./app-state.ts";
export { applyEvent, applyEvents } from "./server-events.ts";
export type { AppState, Toast, Confirmation, PanelId } from "./app-state.ts";
export {
  toggleFavoriteModel,
  setPanelWidth,
  setTheme,
  setCustomColor,
  setScheme,
  toggleInspector,
  toggleThreadDetails,
  toggleBotPanel,
  toggleSidebar,
  setSidebarGroupOpen,
  setUiSize,
  applyUiScale,
  followWindowSize,
  panelWidthValue,
  applyChatWidth,
  setChatWidth,
  applyCodeFont,
  setCodeFont,
  setTextStreaming,
  setShowGitHubIdentity,
  setClock24,
  setShowFailedTools,
  setTypingAnimation,
  setUiSounds,
  setUiAlertSounds,
  setUiSoundVolume,
  setTypingSpeed,
  scaled,
  viewportWidth,
} from "./preferences.ts";

export function environmentDefaults(
  projects: Project[],
  home: string,
  id?: string,
): EnvironmentSlice {
  return {
    shells: {},
    projectDefaults: {},
    assistance: { ...defaultAssistance },
    newThreadProvider: null,
    creatingThread: false,
    notifications: [],
    notificationPreferences: { toasts: true, desktop: true, sound: false, subagents: false },
    searchResult: null,
    searchMessageId: null,
    searchShellId: null,
    connected: false,
    development: false,
    usingAppData: false,
    logging: { enabled: false, file: "" },
    resumeAfterLimits: false,
    githubAccount: null,
    offline: readOffline(id),
    choosingWorkspace: false,
    home,
    projects,
    providers: [],
    threads: {},
    threadOrder: [],
    bots: {},
    botGroups: {},
    activeRosterId: environmentStorage.getItem("citropy.bot", id),
    chatThreadId: null,
    chatsThreadId: null,
    messages: {},
    parts: new Map(),
    reveals: {},
    order: {},
    loaded: {},
    historyPaging: false,
    historyPages: {},
    historyBytes: {},
    timelineVersions: {},
    disclosures: {},
    git: {},
    permissions: [],
    questions: [],
    questionDrafts: {},
    activeProjectId: environmentStorage.getItem("citropy.project", id),
    activeThreadId: environmentStorage.getItem("citropy.thread", id),
    followRequest: 0,
    readingThreadId: null,
    panels: [],
    activePanels: {},
    unseenPanels: {},
    editorTerminals: {},
    browsers: {},
    toolConnections: {},
    tools: [],
  };
}

function withActiveThread(state: AppState, id: string | null): AppState {
  const next = { ...state, activeThreadId: id, searchShellId: null };
  if (id && state.loaded[id]) {
    next.loaded = { ...state.loaded };
    delete next.loaded[id];
    next.loaded[id] = true;
  }
  trimHistories(next);
  return next;
}

export function selectThread(id: string | null): void {
  const thread = id ? useApp.getState().threads[id] : undefined;
  const rosterId = thread?.botId ?? thread?.groupId;
  if (rosterId) return selectRosterEntry(rosterId);
  useApp.setState((state) => {
    if (state.activeThreadId === id) return state;
    const git = { ...state.git };
    const projectId = id ? state.threads[id]?.projectId : state.activeProjectId;
    if (projectId) delete git[projectId];
    return { ...withActiveThread(state, id), git };
  });
  if (id) environmentStorage.setItem("citropy.thread", id);
  else environmentStorage.removeItem("citropy.thread");
}

export function selectRosterEntry(id: string | null): void {
  useApp.setState({ activeRosterId: id, activeView: "bots" });
  if (id) environmentStorage.setItem("citropy.bot", id);
  else environmentStorage.removeItem("citropy.bot");
}

export function showBotThread(id: string | null): void {
  useApp.setState((state) => (state.activeThreadId === id ? state : withActiveThread(state, id)));
}

// Chats live in a hidden workspace, so showing one also makes its workspace the active one.
export function showSectionThread(id: string | null): void {
  useApp.setState((state) => {
    const thread = state.threads[id ?? ""];
    const kept = state.projects.some((project) => project.id === state.activeProjectId)
      ? state.activeProjectId
      : (state.projects[0]?.id ?? null);
    return {
      ...withActiveThread(state, thread ? thread.id : null),
      activeProjectId: thread?.projectId ?? kept,
    };
  });
  const { activeProjectId, activeThreadId } = useApp.getState();
  if (activeProjectId) environmentStorage.setItem("citropy.project", activeProjectId);
  if (activeThreadId) environmentStorage.setItem("citropy.thread", activeThreadId);
  else environmentStorage.removeItem("citropy.thread");
}

/** The rail section that shows a conversation. */
export function threadView(
  thread: { botId?: string; groupId?: string; chat?: boolean } | undefined,
): "chat" | "chats" | "bots" {
  return inBotsView(thread) ? "bots" : thread?.chat ? "chats" : "chat";
}

export function selectProject(id: string): void {
  useApp.setState((state) => {
    const next = { ...state, activeProjectId: id, activeThreadId: null };
    trimHistories(next);
    return next;
  });
  environmentStorage.removeItem("citropy.thread");
  environmentStorage.setItem("citropy.project", id);
}

export function selectPanel(id: string): void {
  const state = useApp.getState();
  const panel = state.panels.find((entry) => entry.id === id);
  if (!panel) return;
  const tabs = state.panels.filter((entry) => entry.projectId === panel.projectId);
  const selected =
    tabs.find((entry) => entry.id === state.activePanels[panel.projectId]) ?? tabs[0];
  if (panel.kind === "terminal" && selected?.kind === "files") {
    setEditorTerminal(selected.id, panel.id);
    return;
  }
  useApp.setState((state) => ({
    activePanels: { ...state.activePanels, [panel.projectId]: id },
    inspectorOpen: true,
  }));
  environmentStorage.setItem("citropy.inspector", "1");
}

export function setEditorTerminal(filesId: string, id?: string): void {
  useApp.setState((state) => {
    const previous = state.editorTerminals[filesId];
    const terminalId = id ?? previous?.id;
    if (!terminalId) return state;
    return {
      editorTerminals: {
        ...state.editorTerminals,
        [filesId]: {
          id: terminalId,
          threadId: state.activeThreadId,
          visible: Boolean(id),
        },
      },
      ...(id ? { inspectorOpen: true } : {}),
    };
  });
  if (id) environmentStorage.setItem("citropy.inspector", "1");
}

export function dismissToast(id: string): void {
  useApp.setState((state) => ({
    toasts: state.toasts.filter((toast) => toast.id !== id),
  }));
}

function focusedAnchor(): Confirmation["anchor"] {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || focused === document.body) return undefined;
  const { top, right, bottom, left } = focused.getBoundingClientRect();
  return right > left ? { top, right, bottom, left } : undefined;
}

export function confirmAction(options: Omit<Confirmation, "resolve" | "anchor">): Promise<boolean> {
  if (useApp.getState().confirmation) return Promise.resolve(false);
  return new Promise((resolve) =>
    useApp.setState({ confirmation: { ...options, anchor: focusedAnchor(), resolve } }),
  );
}

export function answerConfirmation(confirmed: boolean): void {
  const pending = useApp.getState().confirmation;
  useApp.setState({ confirmation: null });
  pending?.resolve(confirmed);
}

export function markTextPresented(id: string): void {
  if (!useApp.getState().reveals[id]) return;
  useApp.setState((state) => {
    const { [id]: presented, ...reveals } = state.reveals;
    return { reveals };
  });
}
