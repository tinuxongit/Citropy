import { ChevronDownIcon, ChevronUpIcon } from "./icons/chevrons.tsx";

interface Props {
  label: string;
  value: string;
  min: number;
  max: number;
  canIncrease?: boolean;
  canDecrease?: boolean;
  onInput: (text: string) => void;
  onStep: (by: 1 | -1) => void;
}

export function Stepper({
  label,
  value,
  min,
  max,
  canIncrease = true,
  canDecrease = true,
  onInput,
  onStep,
}: Props) {
  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-step"
        aria-label={`Increase ${label.toLowerCase()}`}
        disabled={!canIncrease}
        onClick={() => onStep(1)}
      >
        <ChevronUpIcon size={18} />
      </button>
      <label className="stepper-amount">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-label={label}
          onKeyDown={(event) => event.stopPropagation()}
          onChange={(event) => onInput(event.target.value)}
        />
        <span>{label}</span>
      </label>
      <button
        type="button"
        className="stepper-step"
        aria-label={`Decrease ${label.toLowerCase()}`}
        disabled={!canDecrease}
        onClick={() => onStep(-1)}
      >
        <ChevronDownIcon size={18} />
      </button>
    </div>
  );
}
