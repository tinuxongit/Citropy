import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { useEffect, useId, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import type { ReleaseNotes } from "../../../shared/app-update.ts";
import { useAppUpdate } from "../lib/use-app-update.ts";
import { PixelLoader } from "./PixelLoader.tsx";

const notesMotion = {
  enter: ({ step, reducedMotion }: { step: number; reducedMotion: boolean }) => ({ opacity: 0, transform: reducedMotion ? "none" : `translateX(${-8 * step}px)` }),
  shown: { opacity: 1, transform: "none" },
  leave: ({ step, reducedMotion }: { step: number; reducedMotion: boolean }) => ({ opacity: 0, transform: reducedMotion ? "none" : `translateX(${8 * step}px)` }),
};

const size = (bytes?: number) =>
  bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "";

export function AppUpdateControl({ variant }: { variant: "strip" | "settings" }) {
  const reducedMotion = useReducedMotion();
  const { state, command } = useAppUpdate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [history, setHistory] = useState<ReleaseNotes[]>();
  const [historyError, setHistoryError] = useState(false);
  const [browsed, setBrowsed] = useState<number>();
  const [direction, setDirection] = useState(1);
  const olderArrow = useRef<HTMLButtonElement>(null);
  const newerArrow = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (state.status !== "current") return;
    setConfirming(true);
    const reset = setTimeout(() => setConfirming(false), 1500);
    return () => clearTimeout(reset);
  }, [state]);
  const downloading = state.status === "downloading";
  const busy =
    downloading || state.status === "checking" || state.status === "installing";
  const ready =
    state.status === "ready" ||
    (state.status === "error" && state.retry === "install");
  const action = ready
    ? "install"
    : state.status === "available"
      ? "download"
      : state.retry || "check";
  const label =
    state.status === "installing"
      ? "Applying update…"
      : ready
        ? "Restart & apply"
        : downloading
          ? `Downloading ${Math.floor(state.percent || 0)}%`
          : state.status === "checking"
            ? "Checking for updates…"
            : state.status === "available"
              ? "Download update"
              : state.status === "error"
                ? "Retry update"
                : "Check for Citropy updates";
  const title =
    state.status === "unsupported"
      ? "Citropy updates"
      : state.status === "current"
        ? "Citropy is up to date"
        : state.status === "available"
          ? `Citropy ${state.version ?? ""} is available`
          : ready
            ? "Your update is ready"
            : label;
  const notesVersion = state.version && state.status !== "current" ? state.version : state.currentVersion;
  const latestNotes = state.notes?.version === notesVersion ? state.notes : undefined;
  const notes = browsed === undefined ? latestNotes : history?.[browsed];
  const position = history && notes ? history.findIndex((release) => release.version === notes.version) : -1;
  const browse = async (step: 1 | -1) => {
    let releases = history;
    if (!releases) {
      try {
        releases = await window.citropyDesktop!.releaseHistory();
      } catch {
        if (alive.current) setHistoryError(true);
        return;
      }
      if (!alive.current) return;
      setHistory(releases);
      setHistoryError(false);
    }
    const from = releases.findIndex((release) => release.version === notes?.version);
    const next = from + step;
    if (from < 0 || next < 0 || next >= releases.length) return;
    const frame = popover.current;
    if (frame && !frame.style.height) frame.style.height = `${frame.offsetHeight}px`;
    setDirection(step);
    setBrowsed(next);
    const last = step === 1 ? next === releases.length - 1 : next === 0;
    if (last) requestAnimationFrame(() => (step === 1 ? newerArrow : olderArrow).current?.focus({ preventScroll: true }));
  };
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const hide = () => {
    timer.current = setTimeout(() => {
      setOpen(false);
      setBrowsed(undefined);
    }, 160);
  };
  const run = async () => {
    show();
    if (busy || state.status === "unsupported") return;
    await command(action);
  };
  const releaseArrows = (
    <>
      <button ref={olderArrow} type="button" className="icon-btn" aria-label="Older release" title="Older release" disabled={Boolean(history) && (position < 0 || position >= history!.length - 1)} onClick={() => void browse(1)}><ChevronLeft size={15} /></button>
      <button ref={newerArrow} type="button" className="icon-btn" aria-label="Newer release" title="Newer release" disabled={!history || position <= 0} onClick={() => void browse(-1)}><ChevronRight size={15} /></button>
    </>
  );
  const Icon =
    state.status === "error"
      ? TriangleAlert
      : ready
        ? RefreshCw
        : state.status === "current" && confirming
          ? Check
          : Download;
  const face = (
    <>
      {state.status !== "error" && busy && !downloading ? <PixelLoader size={17} /> : <Icon size={17} />}
      {variant === "settings" ? label : downloading && <small>{Math.floor(state.percent || 0)}%</small>}
    </>
  );
  return (
    <div
      className={`app-update-control${variant === "settings" ? " app-update-settings" : ""}`}
      onPointerEnter={show}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) hide();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          clearTimeout(timer.current);
          setOpen(false);
          setBrowsed(undefined);
        }
      }}
    >
      <button
        type="button"
        className={variant === "settings" ? "btn app-update-button" : "rail-action app-update-button"}
        data-state={state.status}
        aria-label={label}
        aria-describedby={open ? id : undefined}
        aria-disabled={busy || state.status === "unsupported"}
        onClick={() => void run()}
      >
        {variant === "strip" ? (
          <span className="strip-action-face">{face}</span>
        ) : face}
      </button>
      <AnimatePresence>{open && (
        <motion.div ref={popover} initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reducedMotion ? 0 : 4, pointerEvents: "none" }} transition={{ duration: reducedMotion ? 0 : 0.16 }} className="app-update-popover" id={id} role="dialog" aria-label={title}>
          <div className="app-update-heading">
            {state.status === "current" ? <Check size={16} /> : <Icon size={16} />}
            <strong>{title}</strong>
            {notes && variant !== "settings" && <span className="app-update-arrows">{releaseArrows}</span>}
          </div>
          {state.currentVersion && (
            <small>
              {state.version && state.status !== "current"
                ? `${state.currentVersion} → ${state.version}`
                : `Version ${state.currentVersion}`}
            </small>
          )}
          {state.message ? (
            <p>{state.message}</p>
          ) : downloading ? (
            <>
              <div className="app-update-progress-label">
                <span>
                  {size(state.transferred)}
                  {state.total ? ` / ${size(state.total)}` : ""}
                </span>
                <strong>{Math.floor(state.percent || 0)}%</strong>
              </div>
              <div
                className="app-update-progress"
                role="progressbar"
                aria-label="Update download"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.floor(state.percent || 0)}
              >
                <div style={{ width: `${state.percent || 0}%` }} />
              </div>
              <p>
                {state.bytesPerSecond
                  ? `${size(state.bytesPerSecond)}/s · `
                  : ""}You can keep working while it downloads.</p>
            </>
          ) : ready ? (
            <p>Download verified. Click again to restart Citropy and apply it.</p>
          ) : state.status === "available" ? (
            <p>Click to download. Citropy will wait for another click before restarting.</p>
          ) : state.status === "current" ? (
            <p>No newer release is available.</p>
          ) : state.status === "installing" ? (
            <p>Saving your work and restarting Citropy.</p>
          ) : (
            <p>Check the latest Citropy release.</p>
          )}
          {notes ? (
            <div className="app-update-notes">
              <div className="app-update-notes-heading">
                <span className="app-update-notes-title">
                  <AnimatePresence initial={false} mode="popLayout" custom={{ step: direction, reducedMotion }}>
                    <motion.strong key={notes.version} custom={{ step: direction, reducedMotion }} variants={notesMotion} initial="enter" animate="shown" exit="leave" transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}>
                      What's in {notes.version}
                    </motion.strong>
                  </AnimatePresence>
                </span>
                {variant === "settings" && releaseArrows}
              </div>
              {historyError && <p className="app-update-notes-error">Could not load older releases.</p>}
              <div className="app-update-notes-body">
                <AnimatePresence initial={false} mode="popLayout" custom={{ step: direction, reducedMotion }}>
                  <motion.div key={notes.version} custom={{ step: direction, reducedMotion }} variants={notesMotion} initial="enter" animate="shown" exit="leave" transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}>
                    {notes.sections.map((section) => (
                      <section key={section.title}>
                        {section.title && <span>{section.title}</span>}
                        <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
                      </section>
                    ))}
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          ) : state.notesError && (
            <p className="app-update-notes-error">Could not load what this release includes.</p>
          )}
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
