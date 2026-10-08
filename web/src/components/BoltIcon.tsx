const BOLT = "M13.5 2.5L4.75 13.25H11.25L10.5 21.5L19.25 10.75H12.75Z";
const ROUNDING = 1.75;

export function BoltIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={ROUNDING} strokeLinejoin="round" aria-hidden="true">
      <path d={BOLT} />
    </svg>
  );
}
