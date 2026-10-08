import { useCallback, useState, type SetStateAction } from "react";
import { useApp } from "./store.ts";

export function useDisclosure(
  id: string | undefined,
  kind: string,
  initial = false,
) {
  const [local, setLocal] = useState<boolean>();
  const open = useApp((state) =>
    (id ? state.disclosures[id]?.[kind] : local) ?? initial,
  );
  const setOpen = useCallback(
    (value: SetStateAction<boolean>) => {
      if (!id) {
        setLocal((current) => typeof value === "function" ? value(current ?? initial) : value);
        return;
      }
      useApp.setState((state) => {
        const previous = state.disclosures[id] ?? {};
        return {
          disclosures: {
            ...state.disclosures,
            [id]: {
              ...previous,
              [kind]:
                typeof value === "function"
                  ? value(previous[kind] ?? initial)
                  : value,
            },
          },
        };
      });
    },
    [id, kind, initial],
  );
  return [open, setOpen] as const;
}
