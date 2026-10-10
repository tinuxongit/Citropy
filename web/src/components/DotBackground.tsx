import "../styles/dot-background.css";

export function DotBackground({ className }: { className: string }) {
  return (
    <span className={`dot-background ${className}`} aria-hidden="true">
      <span className="dot-grid" />
      <span className="dot-glow" />
    </span>
  );
}
