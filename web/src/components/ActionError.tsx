import { useEffect, useEffectEvent, useState, type ReactNode } from "react";

const SETTINGS = { minVisibleMs: 5000, msPerCharacter: 60 };

export function ActionError({ message, onDismiss, className, as: Element = "p", children }: {
  message: string;
  onDismiss: () => void;
  className: string;
  as?: "p" | "div";
  children?: ReactNode;
}) {
  const [held, setHeld] = useState(false);
  const dismiss = useEffectEvent(onDismiss);
  useEffect(() => {
    if (!message || held) return;
    const timer = window.setTimeout(dismiss, Math.max(SETTINGS.minVisibleMs, message.length * SETTINGS.msPerCharacter));
    return () => clearTimeout(timer);
  }, [message, held]);
  if (!message) return null;
  return <Element className={className} role="alert" onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)} onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
    {children ?? message}
  </Element>;
}
