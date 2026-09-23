import type { CSSProperties, HTMLAttributes } from "react";

const RING = [[1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [2, 1]];

export function PixelLoader({ size = 16, className, style, ...rest }: { size?: number } & HTMLAttributes<HTMLSpanElement>) {
  const gap = Math.max(1, Math.ceil(size / 10));
  const cell = Math.max(2, Math.floor((size - 2 * gap) / 3));
  return (
    <span
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
      className={className ? `pixel-loader ${className}` : "pixel-loader"}
      style={{ "--pixel-cell": `${cell}px`, "--pixel-gap": `${gap}px`, ...style } as CSSProperties}
    >
      {RING.map(([row, column], step) => <i key={step} style={{ gridArea: `${row} / ${column}`, "--pixel-step": step } as CSSProperties} />)}
    </span>
  );
}
