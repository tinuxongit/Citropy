import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";
import { useModalDialog } from "../../lib/use-modal-dialog.ts";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";
import { ArrowRightIcon } from "../icons/arrows.tsx";
import { DotBackground } from "../DotBackground.tsx";
import { WindowControls } from "../WindowControls.tsx";
import { SetupRail } from "./SetupRail.tsx";
import { SetupWelcome } from "./SetupWelcome.tsx";
import { SETUP_STEPS } from "./steps.tsx";
import "../../styles/setup.css";

const SCREEN_FADE = 0.24;
const STEP_RISE = 14;
const STEP_ENTER = 0.32;
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

function finishSetup() {
  send({ t: "setup.finish" });
  useApp.setState({ setupOpen: false });
}

function SetupSteps({ index, onIndex }: { index: number; onIndex: (index: number | undefined) => void }) {
  const reducedMotion = useReducedMotion();
  const step = SETUP_STEPS[index]!;
  const last = index === SETUP_STEPS.length - 1;
  return (
    <div className="setup-layout">
      <SetupRail index={index} onSelect={onIndex} />
      <main className="setup-stage">
        <div className="setup-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={SETUP_STEPS.length} aria-valuenow={index + 1}>
          <span style={{ scale: `${(index + 1) / SETUP_STEPS.length} 1` }} />
        </div>
        <motion.div
          key={index}
          className="setup-stage-scroll"
          initial={{ opacity: 0, y: reducedMotion ? 0 : STEP_RISE }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : STEP_ENTER, ease: EASE_OUT }}
        >
          <header className="setup-stage-heading">
            <p className="setup-eyebrow">Step {index + 1} of {SETUP_STEPS.length}</p>
            <h1>{step.title}</h1>
            <p>{step.description}</p>
          </header>
          <div className="setup-step settings-inner"><step.Body /></div>
        </motion.div>
        <footer className="setup-actions">
          {!last && <button className="btn" data-variant="ghost" type="button" onClick={finishSetup}>Skip setup</button>}
          <button className="btn" type="button" onClick={() => onIndex(index === 0 ? undefined : index - 1)}>Back</button>
          <button className="btn setup-cta" data-variant="primary" data-primary type="button" onClick={last ? finishSetup : () => onIndex(index + 1)}>
            {last ? "Start using Citropy" : "Continue"}<ArrowRightIcon size={15} />
          </button>
        </footer>
      </main>
    </div>
  );
}

function SetupScreen() {
  const { ref, present } = useModalDialog("[data-primary]");
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState<number>();
  const welcome = index === undefined;

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-primary]")?.focus({ preventScroll: true });
  }, [welcome]);

  return (
    <motion.dialog
      ref={ref}
      className="setup-screen"
      aria-label="Set up Citropy"
      inert={!present}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : SCREEN_FADE, ease: EASE_OUT }}
      onCancel={(event) => event.preventDefault()}
    >
      <DotBackground className="setup-dots" />
      <div className="setup-titlebar">{window.citropyDesktop && <WindowControls />}</div>
      {index === undefined
        ? <SetupWelcome onStart={() => setIndex(0)} onSkip={finishSetup} />
        : <SetupSteps index={index} onIndex={setIndex} />}
    </motion.dialog>
  );
}

export function SetupGuide() {
  const open = useApp((state) => state.setupOpen);
  return <AnimatePresence>{open && <SetupScreen />}</AnimatePresence>;
}
