import { useEffect, useRef, useState } from "react";
import { useIsPresent } from "motion/react";
import { Modal } from "./Modal.tsx";
import { SiteIcon } from "./SiteIcon.tsx";
import { ArrowLeftIcon } from "./icons/arrows.tsx";
import { RotateCwIcon } from "./icons/rotation.tsx";
import type { SignInState } from "../desktop.d.ts";
import type { Connection } from "../../../shared/features.ts";

function pageAddress(state: SignInState | undefined, connection: Connection): string {
  if (state?.error) return state.error;
  if (!state?.url) return connection.site;
  return new URL(state.url).host;
}

export function SignInDialog({ connection }: { connection: Connection }) {
  const desktop = window.citropyDesktop!;
  const present = useIsPresent();
  const page = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [state, setState] = useState<SignInState>();

  useEffect(() => desktop.onSignInState(setState), [desktop]);

  useEffect(() => {
    const element = page.current;
    if (!element || !shown || !present) return;
    let previous = "";
    const update = () => {
      const { x, y, width, height } = element.getBoundingClientRect();
      const value = JSON.stringify([x, y, width, height]);
      if (value === previous) return;
      previous = value;
      desktop.signInBounds({ x, y, width, height });
    };
    update();
    const resize = new ResizeObserver(update);
    resize.observe(element);
    window.addEventListener("resize", update);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", update);
      desktop.signInBounds(null);
    };
  }, [desktop, shown, present]);

  return (
    <Modal
      className="sign-in-dialog"
      title={`Sign in to ${connection.name}`}
      description={pageAddress(state, connection)}
      icon={<SiteIcon url={connection.url} />}
      onShown={() => setShown(true)}
      onClose={() => desktop.signInCommand("cancel")}
      actions={
        <span className="sign-in-navigation">
          <button className="icon-btn" type="button" aria-label="Back" title="Back" disabled={!state?.canGoBack} onClick={() => desktop.signInCommand("back")}>
            <ArrowLeftIcon size={15} />
          </button>
          <button className="icon-btn" type="button" aria-label="Reload" title="Reload" disabled={state?.loading} onClick={() => desktop.signInCommand("reload")}>
            <RotateCwIcon size={14} />
          </button>
        </span>
      }
      footer={
        <>
          <span className="dialog-footer-start sign-in-hint">Sign in on the page, then choose Done.</span>
          <button className="btn" type="button" data-cancel onClick={() => desktop.signInCommand("cancel")}>Cancel</button>
          <button className="btn" type="button" data-variant="primary" onClick={() => desktop.signInCommand("done")}>Done</button>
        </>
      }
    >
      <div className="sign-in-page" ref={page} />
    </Modal>
  );
}
