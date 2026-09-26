import { useI18n } from "../lib/i18n.ts";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { GitBranch, Github, Settings, BarChart3 } from "lucide-react";

import { AppUpdateControl } from "./AppUpdateControl.tsx";
import { useUsagePeek } from "./UsagePeek.tsx";

const FADE_MS = 90;
const RESIZE_MS = 200;

export function SidebarFooter({
  onGit,
  onGitHub,
  onSettings,
  onUsage,
  activeView,
}: {
  onGit: () => void;
  onGitHub: () => void;
  onSettings: () => void;
  onUsage: () => void;
  activeView?: string;
}) {
  const t = useI18n();
  const [compact, setCompact] = useState(
    () => localStorage.getItem("citropy.compactNavigation") !== "0",
  );
  const [fading, setFading] = useState(false);
  const target = useRef(compact);
  const timers = useRef<number[]>([]);
  const drag = useRef<number | undefined>(undefined);
  const moved = useRef(false);
  const reducedMotion = useReducedMotion();
  const usagePeek = useUsagePeek("top");
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const change = (value: boolean) => {
    target.current = value;
    localStorage.setItem("citropy.compactNavigation", value ? "1" : "0");
    if (reducedMotion) {
      setCompact(value);
      return;
    }
    timers.current.forEach(clearTimeout);
    setFading(true);
    timers.current = [
      window.setTimeout(() => setCompact(value), FADE_MS),
      window.setTimeout(() => setFading(false), FADE_MS + RESIZE_MS),
    ];
  };
  const actions = [
    { name: "Source control", icon: GitBranch, run: onGit, tone: "git" },
    { name: "GitHub", icon: Github, run: onGitHub, tone: "github" },
    { name: "Usage", icon: BarChart3, run: onUsage, tone: "usage" },
    { name: "Settings", icon: Settings, run: onSettings, tone: "settings" },
  ];
  return (
    <div className="rail-footer navigation-footer" data-compact={compact}>
      <button
        type="button"
        className="navigation-handle"
        aria-label={t(compact ? "Expand navigation" : "Collapse navigation")}
        aria-expanded={!compact}
        title={t(compact ? "Drag up to show labels" : "Drag down for icons only")}
        onPointerDown={(event) => {
          drag.current = event.clientY;
          moved.current = false;
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (drag.current === undefined) return;
          const distance = event.clientY - drag.current;
          if (Math.abs(distance) >= 20) {
            moved.current = true;
            if (target.current !== distance > 0) change(distance > 0);
          }
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
          moved.current = true;
        }}
        onClick={() => {
          if (!moved.current) change(!target.current);
          moved.current = false;
        }}
      />
      <nav className="navigation-actions" data-fading={fading || undefined} aria-label={t("Workspace navigation")}>
        {actions.map(({ name, icon: Icon, run, tone }) => (
          <button
            type="button"
            className="rail-action"
            data-tone={tone}
            aria-current={activeView === tone ? "page" : undefined}
            key={t(name)}
            onClick={() => { usagePeek.hide(); run(); }}
            aria-label={t(name)}
            title={compact && tone !== "usage" ? t(name) : undefined}
            aria-describedby={tone === "usage" ? usagePeek.describedBy : undefined}
            {...(tone === "usage" ? usagePeek.bind : {})}
          >
            <Icon size={17} />
            <span>{t(name)}</span>
          </button>
        ))}
        <span className="navigation-update-divider" aria-hidden="true" />
        <AppUpdateControl />
      </nav>
      {usagePeek.card}
    </div>
  );
}
