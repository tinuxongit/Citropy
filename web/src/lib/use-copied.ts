import { useEffect, useRef, useState } from "react";
import { reportError } from "./api.ts";
import { copyText } from "./copy-text.ts";

const SETTINGS = { copiedMs: 1500 };

export function useCopied() {
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = (text: string) => {
    void copyText(text).then(() => {
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), SETTINGS.copiedMs);
    }).catch(reportError);
  };
  return [copied, copy] as const;
}
