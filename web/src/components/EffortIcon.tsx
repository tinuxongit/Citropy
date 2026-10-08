const BAR_WIDTH = 4.5;
const BAR_GAP = 1.5;
const BAR_HEIGHTS = [7, 11.5, 16, 20.5];
const BAR_RADIUS = 1.75;
const BASELINE = 22;
const UNFILLED_OPACITY = 0.3;

export function EffortIcon({ size = 24, filled = 1 }: { size?: number; filled?: number }) {
  const lit = Math.ceil(filled * BAR_HEIGHTS.length);
  const start = (24 - BAR_HEIGHTS.length * BAR_WIDTH - (BAR_HEIGHTS.length - 1) * BAR_GAP) / 2;
  return (
    <svg className="solid-icon" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {BAR_HEIGHTS.map((height, index) => (
        <rect
          key={height}
          x={start + index * (BAR_WIDTH + BAR_GAP)}
          y={BASELINE - height}
          width={BAR_WIDTH}
          height={height}
          rx={BAR_RADIUS}
          opacity={index < lit ? 1 : UNFILLED_OPACITY}
        />
      ))}
    </svg>
  );
}
