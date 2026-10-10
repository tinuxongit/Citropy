import { ArrowRightIcon } from "../icons/arrows.tsx";
import { SETUP_STEPS } from "./steps.tsx";

export function SetupWelcome({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) {
  return (
    <section className="setup-welcome" aria-labelledby="setup-welcome-title">
      <span className="setup-welcome-mark" aria-hidden="true" />
      <h1 id="setup-welcome-title">Welcome to Citropy</h1>
      <p>Set how it looks, install the tools it needs, and connect your AI providers. Everything here can be changed later in Settings.</p>
      <ol className="setup-welcome-steps">
        {SETUP_STEPS.map((step, index) => <li key={step.label}><span>{index + 1}</span>{step.label}</li>)}
      </ol>
      <div className="setup-welcome-actions">
        <button className="btn setup-cta" data-variant="primary" data-primary type="button" onClick={onStart}>
          Get started<ArrowRightIcon size={16} />
        </button>
        <button className="btn" data-variant="ghost" type="button" onClick={onSkip}>Skip setup</button>
      </div>
    </section>
  );
}
