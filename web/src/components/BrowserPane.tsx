import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon } from "./icons/arrows.tsx";
import { RotateCwIcon } from "./icons/rotation.tsx";
import { CircleAlertIcon } from "./icons/status.tsx";
import { CheckIcon, CloseIcon } from "./icons/marks.tsx";
import { LinkIcon } from "./icons/editing.tsx";
import { send } from "../lib/socket.ts";
import { api } from "../lib/api.ts";
import { ActionError } from "./ActionError.tsx";
import { addressOrSearch } from "../lib/web-search.ts";
import { useApp } from "../lib/store.ts";
import { BrowserViewport } from "./BrowserViewport.tsx";
import type { BrowserAction, PanelTab } from "../../../shared/workbench.ts";
import { useCopied } from "../lib/use-copied.ts";
import { fitScale, useBrowserSurfaces } from "../lib/browser-surfaces.ts";
import { useBrowserSurface } from "../lib/use-browser-surface.ts";

export function BrowserPane({
  panel,
  active,
}: {
  panel: PanelTab;
  active: boolean;
}) {
  const state = useApp((store) => store.browsers[panel.id]);
  const connected = useApp((store) => store.connected);
  const searchEngine = useApp((store) => store.searchEngine);
  const native = Boolean(window.citropyDesktop);
  const [address, setAddress] = useState("");
  const [dialogText, setDialogText] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [copied, copy] = useCopied();
  const frame = useRef<HTMLDivElement>(null);
  const surface = useBrowserSurfaces((store) => store.byId[panel.id]);
  const input = useRef<HTMLInputElement>(null);
  const act = (action: BrowserAction) => {
    if (connected) send({ t: "browser.action", id: panel.id, input: action });
  };
  const finishSignIn = async (id: string) => {
    setFinishing(true);
    setSignInError("");
    try {
      await api("connections/status", { method: "POST", body: JSON.stringify({ id, signedIn: true }) });
    } catch (error) {
      setSignInError((error as Error).message);
    } finally {
      setFinishing(false);
    }
  };

  useEffect(() => {
    setAddress(state?.url === "about:blank" ? "" : (state?.url ?? ""));
  }, [state?.url]);
  useEffect(
    () =>
      window.citropyDesktop?.onAddressFocus((id) => {
        if (id === panel.id) {
          input.current?.focus();
          input.current?.select();
        }
      }),
    [panel.id],
  );
  const shown = Boolean(active && connected && state && state.url !== "about:blank" && !state.dialog);
  useBrowserSurface(panel.id, frame, shown);

  return (
    <div className="browser-pane">
      <div className="browser-toolbar">
        <div className="browser-navigation">
          <button
            className="icon-btn"
            type="button"
            disabled={!native || !connected || !(state?.canGoBack || state?.mobile)}
            title="Back"
            aria-label="Browser back"
            onClick={() => act({ action: "back" })}
          >
            <ArrowLeftIcon size={14} />
          </button>
          <button
            className="icon-btn"
            type="button"
            disabled={!native || !connected || !state?.canGoForward}
            title="Forward"
            aria-label="Browser forward"
            onClick={() => act({ action: "forward" })}
          >
            <ArrowRightIcon size={14} />
          </button>
          {state?.loading ? (
            <button
              className="icon-btn"
              type="button"
              disabled={!native || !connected}
              title="Stop loading"
              aria-label="Stop loading"
              onClick={() => act({ action: "stop" })}
            >
              <CloseIcon size={14} />
            </button>
          ) : (
            <button
              className="icon-btn"
              type="button"
              disabled={!native || !connected || !state}
              title="Reload"
              aria-label="Reload browser"
              onClick={() => act({ action: "reload" })}
            >
              <RotateCwIcon size={13} />
            </button>
          )}
        </div>
        <form
          className="browser-address"
          onSubmit={(event) => {
            event.preventDefault();
            if (address.trim()) act({ action: "navigate", url: addressOrSearch(address, searchEngine) });
          }}
        >
          <input
            ref={input}
            value={address}
            disabled={!native || !connected || !state}
            onChange={(event) => setAddress(event.target.value)}
            aria-label="Browser address"
            placeholder="Search or enter a web address"
            spellCheck={false}
          />
          {state && state.url !== "about:blank" && (
            <button
              type="button"
              aria-label={copied ? "Copied" : "Copy link"}
              title={copied ? "Copied" : "Copy link"}
              onClick={() => copy(state.url)}
            >
              {copied ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
            </button>
          )}
          {state && state.url !== "about:blank" && (
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open in your browser"
              title="Open in your browser"
            >
              <ArrowUpRightIcon size={14} />
            </a>
          )}
        </form>
      </div>
      {native && state?.account && !state.account.signedIn && (
        <div className="browser-notice browser-sign-in">
          <span>Sign in to {state.profileName} below, then finish.</span>
          <button className="btn" data-variant="primary" disabled={finishing || !connected} onClick={() => void finishSignIn(state.account!.id)}>Finish sign-in</button>
        </div>
      )}
      {signInError && <ActionError className="browser-notice" message={signInError} onDismiss={() => setSignInError("")} />}
      {native && state && (
        <BrowserViewport state={state} disabled={!connected} onResize={act} />
      )}
      {!connected && (
        <div className="browser-notice">Reconnecting to Citropy…</div>
      )}
      {state?.error && (
        <div className="browser-notice" role="alert">
          <CircleAlertIcon size={14} />
          {state.error}
        </div>
      )}
      {state?.dialog && native && (
        <form
          className="browser-dialog"
          onSubmit={(event) => {
            event.preventDefault();
            act({ action: "dialog", accept: true, text: dialogText });
            setDialogText("");
          }}
        >
          <strong>This page says</strong>
          <p>{state.dialog.message}</p>
          {state.dialog.type === "prompt" && (
            <input
              value={dialogText}
              onChange={(event) => setDialogText(event.target.value)}
              aria-label="Browser dialog response"
              autoFocus
            />
          )}
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => act({ action: "dialog", accept: false })}
            >{" "}Dismiss{" "}</button>
            <button type="submit" className="btn" data-variant="primary">{" "}OK{" "}</button>
          </div>
        </form>
      )}
      <div className="browser-screen" aria-label="Browser page">
        {!native ? (
          <div className="browser-start">
            <h3>Continue in Citropy desktop</h3>
            <p>{" "}The desktop app runs the browser directly, with normal scrolling, typing, and tabs shared with your provider.{" "}</p>
            <button
              type="button"
              className="btn" data-variant="primary"
              disabled={!connected}
              onClick={() => send({ t: "desktop.open" })}
            >{" "}Open Citropy desktop{" "}<ArrowUpRightIcon size={14} />
            </button>
          </div>
        ) : !state ? (
          <div className="browser-start">
            <h3>Opening browser…</h3>
            <p>Preparing a browser for this workspace.</p>
          </div>
        ) : (
          <div
            ref={frame}
            className="browser-frame"
            style={{ "--page-width": state.width, "--page-height": state.height } as CSSProperties}
          >
            {state.url === "about:blank" && (
              <div className="browser-start">
                <p>Enter an address above, or ask your provider to open a page.</p>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="browser-footer">
        <span>
          {native
            ? `${state?.profileName ?? "Workspace"} · Shared with providers`
            : "Desktop browser"}
        </span>
        {native && state && surface && (
          <span>Fit{" "}{Math.round(fitScale(surface, state.width) * 100)}%</span>
        )}
      </div>
    </div>
  );
}
