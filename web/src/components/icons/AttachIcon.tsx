const CLIP = "M16.5 7.5l-7.6 7.75a1.9 1.9 0 0 0 2.7 2.7l7.9-8.05a3.9 3.9 0 0 0-5.5-5.5l-8 8.15a5.9 5.9 0 0 0 8.35 8.35l7.15-7.3";
const CLIP_WIDTH = 2.5;

export function AttachIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={CLIP_WIDTH} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CLIP} />
    </svg>
  );
}
