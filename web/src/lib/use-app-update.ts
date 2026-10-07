import { useEffect, useRef, useState } from "react";
import type { AppUpdateState } from "../../../shared/app-update.ts";

const UNSUPPORTED_STATE: AppUpdateState = {
  status: "unsupported",
  currentVersion: "",
  message: "Open the installed Citropy desktop app to manage release updates.",
};

export function useAppUpdate() {
  const [state, setState] = useState(UNSUPPORTED_STATE);
  const revision = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const desktop = window.citropyDesktop;
    let received = false;
    const off = desktop?.onUpdateState?.((value) => {
      received = true;
      revision.current++;
      setState(value);
    });
    void desktop
      ?.updateState?.()
      .then((value) => {
        if (mounted.current && !received) setState(value);
      })
      .catch((error) => console.error("Reading the update state failed:", error));
    return () => {
      mounted.current = false;
      off?.();
    };
  }, []);
  const command = async (action: "check" | "download" | "install") => {
    try {
      const before = revision.current;
      const value = await window.citropyDesktop?.updateCommand(action);
      if (value && mounted.current && revision.current === before)
        setState(value);
    } catch {
      if (mounted.current)
        setState((previous) => ({
          ...previous,
          status: "error",
          retry: action,
          message: "The desktop update service did not respond. Try again.",
        }));
    }
  };
  return { state, command };
}
