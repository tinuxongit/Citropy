import { useId } from "react";

const TAG = "M2.5 5A2.5 2.5 0 0 1 5 2.5h6.17a2.5 2.5 0 0 1 1.77.73l7.83 7.83a2.5 2.5 0 0 1 0 3.54l-6.17 6.17a2.5 2.5 0 0 1-3.54 0L3.23 12.94a2.5 2.5 0 0 1-.73-1.77z";
const HOLE = { cx: 7.75, cy: 7.75, r: 1.75 };

export function TagIcon({ size = 24 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <defs>
        <mask id={id}>
          <rect width="24" height="24" fill="white" />
          <circle {...HOLE} fill="black" />
        </mask>
      </defs>
      <path d={TAG} mask={`url(#${id})`} />
    </svg>
  );
}
