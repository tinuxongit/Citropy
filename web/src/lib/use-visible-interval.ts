import { useEffect, useRef } from "react";

export function useVisibleInterval(run: () => void, ms: number, active = true): void {
  const latest = useRef(run);
  latest.current = run;
  useEffect(() => {
    if (!active) return;
    let timer = 0;
    const start = () => {
      clearInterval(timer);
      if (!document.hidden) timer = window.setInterval(() => latest.current(), ms);
    };
    const resume = () => {
      if (document.hidden) return start();
      latest.current();
      start();
    };
    start();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
    };
  }, [ms, active]);
}
