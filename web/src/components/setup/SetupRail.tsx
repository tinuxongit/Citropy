import { CheckIcon } from "../icons/marks.tsx";
import { SETUP_STEPS } from "./steps.tsx";

export function SetupRail({ index, onSelect }: { index: number; onSelect: (index: number) => void }) {
  return (
    <nav className="setup-rail" aria-label="Setup steps">
      <div className="setup-brand">
        <span className="setup-brand-mark" aria-hidden="true" />
        Citropy
      </div>
      <ol className="setup-rail-steps">
        {SETUP_STEPS.map((step, position) => (
          <li key={step.label} data-state={position < index ? "done" : position === index ? "current" : "upcoming"}>
            <button type="button" aria-current={position === index ? "step" : undefined} onClick={() => onSelect(position)}>
              <span className="setup-rail-number">{position < index ? <CheckIcon size={13} /> : position + 1}</span>
              <span className="setup-rail-text">
                <strong>{step.label}</strong>
                <small>{step.hint}</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="setup-rail-note">You can change all of this later in Settings.</p>
    </nav>
  );
}
