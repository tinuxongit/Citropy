import { WebContentsView, session, type BrowserWindow, type Rectangle } from "electron";
import { keepSessionCookies } from "./session-cookies.ts";

const BACKGROUND = "#151515";
const NAVIGATION_ABORTED = -3;

interface SignIn {
  view: WebContentsView;
  error: string | undefined;
  finish: (signedIn: boolean) => void;
}

function isWebAddress(url: string) {
  return ["http:", "https:"].includes(new URL(url).protocol);
}

export function createSignInView(window: BrowserWindow) {
  let current: SignIn | undefined;
  let bounds: Rectangle | undefined;

  const publish = (entry: SignIn) => {
    const content = entry.view.webContents;
    window.webContents.send("connections:sign-in-state", {
      url: content.getURL(),
      loading: content.isLoading(),
      canGoBack: content.navigationHistory.canGoBack(),
      error: entry.error,
    });
  };

  const show = () => {
    if (!current || !bounds) return current?.view.setVisible(false);
    const [width = 0, height = 0] = window.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x)));
    const y = Math.max(0, Math.min(height, Math.round(bounds.y)));
    current.view.setBounds({
      x,
      y,
      width: Math.max(1, Math.min(width - x, Math.round(bounds.width))),
      height: Math.max(1, Math.min(height - y, Math.round(bounds.height))),
    });
    const hidden = !current.view.getVisible();
    current.view.setVisible(true);
    if (hidden) current.view.webContents.focus();
  };

  const finish = (signedIn: boolean) => current?.finish(signedIn);

  window.webContents.on("did-navigate", () => finish(false));
  window.webContents.on("render-process-gone", () => finish(false));

  return {
    async open({ partition, url }: { partition: string; url: string }) {
      finish(false);
      const signInSession = session.fromPartition(partition);
      keepSessionCookies(signInSession);
      signInSession.setPermissionRequestHandler((_, __, callback) => callback(false));
      signInSession.setPermissionCheckHandler(() => false);
      const view = new WebContentsView({
        webPreferences: {
          session: signInSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
        },
      });
      view.setBackgroundColor(BACKGROUND);
      view.setVisible(false);
      window.contentView.addChildView(view);
      const content = view.webContents;
      const entry: SignIn = { view, error: undefined, finish: () => {} };
      const finished = new Promise<boolean>((resolve) => (entry.finish = resolve));
      current = entry;
      for (const event of [
        "did-start-loading",
        "did-stop-loading",
        "did-navigate",
        "did-navigate-in-page",
      ] as const)
        content.on(event as "did-start-loading", () => {
          if (event === "did-start-loading") entry.error = undefined;
          if (current === entry) publish(entry);
        });
      content.on("did-fail-load", (_, code, description, __, mainFrame) => {
        if (!mainFrame || code === NAVIGATION_ABORTED) return;
        entry.error = description;
        if (current === entry) publish(entry);
      });
      content.on("will-navigate", (event, address) => {
        if (!isWebAddress(address)) event.preventDefault();
      });
      content.setWindowOpenHandler(({ url: address }) => {
        if (isWebAddress(address)) void content.loadURL(address).catch(() => {});
        return { action: "deny" };
      });
      show();
      content.loadURL(url).catch(() => {});
      const signedIn = await finished;
      if (current === entry) current = undefined;
      window.contentView.removeChildView(view);
      content.close();
      return signedIn;
    },
    place(next: Rectangle | null | undefined) {
      bounds = next ?? undefined;
      show();
    },
    command(command: string) {
      if (!current) return;
      const content = current.view.webContents;
      if (command === "back") content.navigationHistory.goBack();
      else if (command === "reload") content.reload();
      else if (command === "done") finish(true);
      else if (command === "cancel") finish(false);
      else throw new Error(`Unknown sign-in command: ${command}`);
    },
  };
}
