import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ExternalLink, Square, Terminal, X } from "lucide-react";
import type { NotificationTarget, ShellProcess } from "../../../shared/protocol.ts";
import { scaled, useApp, viewportWidth } from "../lib/store.ts";
import { api } from "../lib/api.ts";
import { useI18n } from "../lib/i18n.ts";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";

type ShellEntry = ShellProcess;

const active = (shell: ShellEntry) => !shell.panelId && (shell.status === "running" || shell.status === "stopping");

export function RunningShells({ onOpen }: { onOpen: (target: NotificationTarget) => void }) {
  const t = useI18n();
  const count = useApp(state => Object.values(state.shells).filter(active).length);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const close = () => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  };
  return <div className="shells-wrap">
    {(count > 0 || open) && <button ref={trigger} type="button" className="icon-btn shells-trigger" title={t("Running shells")} aria-label={t("Running shells, {count} active", { count })} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <Terminal size={13} /><span>{count}</span>
    </button>}
    <AnimatePresence>{open && <ShellsPanel id={id} trigger={trigger} onClose={close} onOpen={onOpen} />}</AnimatePresence>
  </div>;
}

function ShellsPanel({ id, trigger, onClose, onOpen }: {
  id: string;
  trigger: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpen: (target: NotificationTarget) => void;
}) {
  const t = useI18n();
  const reducedMotion = useReducedMotion();
  const shells = useApp(state => state.shells);
  const threads = useApp(state => state.threads);
  const projects = useApp(state => state.projects);
  const connected = useApp(state => state.connected);
  const uiScale = useApp(state => state.uiScale);
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<{ id: string; message: string }>();
  const panel = useRef<HTMLElement>(null);
  const running = useMemo(() => Object.values(shells).filter(active).sort((a, b) => b.startedAt - a.startedAt), [shells]);
  const [selectedId, setSelectedId] = useState<string | undefined>(() => running[0]?.id);
  const selected = running.find(shell => shell.id === selectedId) || running[0];
  const owner = (shell: ShellEntry) => shell.threadId && threads[shell.threadId]?.title || projects.find(project => project.id === shell.projectId)?.name || t("Workspace");
  const label = (shell: ShellEntry) => shell.command || t("Shell command");
  const status = (shell: ShellEntry) => t(shell.status === "stopping" ? "Stopping…" : shell.background ? "Background" : "Running");

  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    element.showPopover();
    const position = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      if (!anchor) return;
      const scale = uiScale / 100;
      const width = Math.min(420, viewportWidth() - 24);
      element.style.width = `${scaled(width)}px`;
      element.style.left = `${scaled(Math.max(12, Math.min(anchor.right / scale - width, viewportWidth() - width - 12)))}px`;
      element.style.bottom = `${scaled((innerHeight - anchor.top) / scale + 8)}px`;
      element.style.maxHeight = `${scaled(Math.max(0, anchor.top / scale - 22))}px`;
    };
    position();
    const resize = new ResizeObserver(position);
    if (trigger.current) resize.observe(trigger.current);
    window.addEventListener("resize", position);
    return () => { resize.disconnect(); window.removeEventListener("resize", position); };
  }, [uiScale, trigger]);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) onClose();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", key); };
  }, [onClose, trigger]);

  useEffect(() => { setError(undefined); }, [selected?.id]);

  const stop = async (shell: ShellEntry) => {
    setPending(shell.id);
    setError(undefined);
    try { await api("shells/stop", { method: "POST", body: JSON.stringify({ id: shell.id }) }); }
    catch (error) { setError({ id: shell.id, message: (error as Error).message }); }
    finally { setPending(undefined); }
  };
  const rows = (entries: ShellEntry[]) => entries.map(shell => <button key={shell.id} type="button" className="shell-row" data-selected={selected?.id === shell.id} aria-pressed={selected?.id === shell.id} onClick={() => setSelectedId(shell.id)}>
    <span className="shell-status-dot" data-status={shell.status} />
    <span className="shell-row-copy"><code title={shell.command}>{label(shell)}</code><small>{owner(shell)}</small></span>
    <span className="shell-status" data-status={shell.status}>{status(shell)}</span>
  </button>);
  return <motion.section ref={panel} id={id} popover="manual" role="dialog" aria-label={t("Running shells")} className="shells-panel" initial={{ opacity: 0, transform: reducedMotion ? "none" : "translateY(5px)" }} animate={{ opacity: 1, transform: "none" }} exit={{ opacity: 0, transform: reducedMotion ? "none" : "translateY(5px)", pointerEvents: "none" }} transition={{ duration: reducedMotion ? 0 : 0.16 }}>
    <header><Terminal size={16} /><h2>{t("Running shells")}</h2><span>{t("{count} active", { count: running.length })}</span><button type="button" className="icon-btn" autoFocus aria-label={t("Close running shells")} onClick={onClose}><X size={16} /></button></header>
    <div className="shells-list scroll">
      {rows(running)}
    </div>
    {selected ? <div className="shell-detail">
      <code className="shell-command">{label(selected)}</code>
      {selected.command && selected.command !== label(selected) && <code className="shell-command">{selected.command}</code>}
      {selected.busy && selected.process && <code className="shell-command">{selected.process}</code>}
      <div className="shell-directory" title={selected.cwd}>{selected.cwd}</div>
      <div className="shell-actions">
        <button type="button" className="btn btn-sm" onClick={() => {
          onOpen({ view: "chat", projectId: selected.projectId, threadId: selected.threadId });
          if (selected.threadId) useApp.setState({ searchMessageId: null, searchShellId: selected.id });
          onClose();
        }}><ExternalLink size={13} />{t("Show command")}</button>
        {<button type="button" className="btn btn-sm" disabled={!connected || Boolean(pending) || selected.status === "stopping"} onClick={() => void stop(selected)}><Square size={12} />{t(selected.status === "stopping" || pending === selected.id ? "Stopping…" : selected.stopMode === "shell" ? "Stop shell" : "Stop task")}</button>}
      </div>
      {selected.stopMode === "task" && <p className="shell-stop-hint">{t("Stopping this shell also stops its AI task.")}</p>}
      {error?.id === selected.id && <p className="shell-error" role="alert">{error.message}</p>}
    </div> : <p className="shell-output-empty">{t("No shells are running.")}</p>}
  </motion.section>;
}
