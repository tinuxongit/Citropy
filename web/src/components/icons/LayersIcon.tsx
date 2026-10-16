const TOP = "M12 2.75L21 7.75L12 12.75L3 7.75Z";
const TOP_ROUNDING = 2;
const SHEETS = "M3 12.25L12 17.25L21 12.25M3 16.75L12 21.75L21 16.75";
const SHEET_WIDTH = 2.25;

export function LayersIcon({ size = 24 }: { size?: number }) {
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TOP} strokeWidth={TOP_ROUNDING} />
      <path d={SHEETS} fill="none" strokeWidth={SHEET_WIDTH} />
    </svg>
  );
}
