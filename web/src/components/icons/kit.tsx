import { useId, type ReactNode, type SVGProps } from "react";

export const LINE = 2.5;
export const BOLD_LINE = 2.75;
export const CUT = 1.75;
export const GAP = 1.5;

export type IconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { size?: number };

export function Icon({ size = 24, className, children, ...svg }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={svg["aria-label"] ? undefined : true}
      role={svg["aria-label"] ? "img" : undefined}
      {...svg}
      className={className ? `solid-icon ${className}` : "solid-icon"}
      width={size}
      height={size}
    >
      {children}
    </svg>
  );
}

export function Line({ d, width = LINE, ...path }: { d: string; width?: number } & Omit<SVGProps<SVGPathElement>, "d" | "width">) {
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" {...path} />;
}

export function Knockout({ cuts, children }: { cuts: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="white" />
        <g color="black" fill="currentColor">{cuts}</g>
      </mask>
      <g mask={`url(#${id})`}>{children}</g>
    </>
  );
}

export function Turn({ degrees, mirror, children }: { degrees?: number; mirror?: boolean; children: ReactNode }) {
  const transform = [degrees && `rotate(${degrees} 12 12)`, mirror && "matrix(-1 0 0 1 24 0)"].filter(Boolean).join(" ");
  return <g transform={transform || undefined}>{children}</g>;
}
