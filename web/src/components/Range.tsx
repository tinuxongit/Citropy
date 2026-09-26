import type { CSSProperties, InputHTMLAttributes } from "react";

export function Range({ value, min, max, className, style, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "min" | "max"> & {
  value: number;
  min: number;
  max: number;
}) {
  const fill = max > min ? ((value - min) / (max - min)) * 100 : 0;
  return (
    <input
      {...rest}
      type="range"
      min={min}
      max={max}
      value={value}
      className={className ? `range ${className}` : "range"}
      style={{ ...style, "--fill": `${fill}%` } as CSSProperties}
    />
  );
}
