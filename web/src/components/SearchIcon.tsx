const LENS = { cx: 10.5, cy: 10.5, r: 7 };
const LENS_WIDTH = 3;
const HANDLE = "M16 16l5 5";
const HANDLE_WIDTH = 3.5;
const GLINT = "M7 10.5a3.5 3.5 0 0 1 3.5-3.5";
const GLINT_WIDTH = 2;

export function SearchIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
      <circle {...LENS} strokeWidth={LENS_WIDTH} />
      <path d={HANDLE} strokeWidth={HANDLE_WIDTH} />
      <path d={GLINT} strokeWidth={GLINT_WIDTH} />
    </svg>
  );
}
