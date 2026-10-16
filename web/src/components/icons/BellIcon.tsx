const BELL = "M12 2a6.5 6.5 0 0 0-6.5 6.5v3.6c0 .7-.24 1.38-.68 1.93l-1.1 1.37A1.5 1.5 0 0 0 4.9 17.8h14.2a1.5 1.5 0 0 0 1.18-2.4l-1.1-1.37a3.1 3.1 0 0 1-.68-1.93V8.5A6.5 6.5 0 0 0 12 2z";
const CLAPPER = "M9 19.5a3 3 0 0 0 6 0z";

export function BellIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={BELL} />
      <path d={CLAPPER} />
    </svg>
  );
}
