const LARGE = "M10 3.5c.4 0 .72.27.83.65l.9 3.2a4.5 4.5 0 0 0 3.12 3.12l3.2.9a.86.86 0 0 1 0 1.66l-3.2.9a4.5 4.5 0 0 0-3.12 3.12l-.9 3.2a.86.86 0 0 1-1.66 0l-.9-3.2a4.5 4.5 0 0 0-3.12-3.12l-3.2-.9a.86.86 0 0 1 0-1.66l3.2-.9a4.5 4.5 0 0 0 3.12-3.12l.9-3.2A.86.86 0 0 1 10 3.5z";
const SMALL = "M18.5 2c.25 0 .45.16.52.4l.33 1.17a2 2 0 0 0 1.08 1.08l1.17.33a.54.54 0 0 1 0 1.04l-1.17.33a2 2 0 0 0-1.08 1.08l-.33 1.17a.54.54 0 0 1-1.04 0l-.33-1.17a2 2 0 0 0-1.08-1.08l-1.17-.33a.54.54 0 0 1 0-1.04l1.17-.33a2 2 0 0 0 1.08-1.08l.33-1.17A.54.54 0 0 1 18.5 2z";

export function SparkleIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={LARGE} />
      <path d={SMALL} />
    </svg>
  );
}
