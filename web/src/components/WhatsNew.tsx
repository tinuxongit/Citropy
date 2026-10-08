import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { SparkleIcon } from "./SparkleIcon.tsx";
import type { ReleaseNotes } from "../../../shared/app-update.ts";
import { useApp } from "../lib/store.ts";
import { useAppUpdate } from "../lib/use-app-update.ts";
import { Modal } from "./Modal.tsx";

const SEEN_VERSION = "citropy.whatsNewSeen";

function useNotesAfterUpdate() {
  const agentReplying = useApp((state) => Boolean(state.threads[state.activeThreadId ?? ""]?.running));
  const { state } = useAppUpdate();
  const [waiting, setWaiting] = useState<ReleaseNotes>();
  useEffect(() => {
    if (!state.currentVersion) return;
    const seen = localStorage.getItem(SEEN_VERSION);
    if (!seen) localStorage.setItem(SEEN_VERSION, state.currentVersion);
    else if (seen !== state.currentVersion && state.notes?.version === state.currentVersion) setWaiting(state.notes);
  }, [state]);
  useEffect(() => {
    if (!waiting || agentReplying) return;
    localStorage.setItem(SEEN_VERSION, waiting.version);
    useApp.setState({ whatsNew: waiting });
    setWaiting(undefined);
  }, [waiting, agentReplying]);
}

export function WhatsNew() {
  const notes = useApp((state) => state.whatsNew);
  useNotesAfterUpdate();
  const close = () => useApp.setState({ whatsNew: null });
  return (
    <AnimatePresence>{notes && (
      <Modal
        className="whats-new-dialog"
        title={`What's new in Citropy ${notes.version}`}
        icon={<SparkleIcon size={20} />}
        initialFocus="[data-primary]"
        onClose={close}
        footer={<button className="btn" data-variant="primary" data-primary type="button" onClick={close}>Got it</button>}
      >
        {notes.sections.map((section) => (
          <section key={section.title} className="whats-new-section">
            {section.title && <h3>{section.title}</h3>}
            <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </section>
        ))}
      </Modal>
    )}</AnimatePresence>
  );
}
