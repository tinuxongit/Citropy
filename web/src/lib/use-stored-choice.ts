import { useState } from "react";

export function useStoredChoice<T extends string>(key: string, options: readonly T[], fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    return (options as readonly string[]).includes(stored ?? "") ? stored as T : fallback;
  });
  const choose = (next: T) => {
    localStorage.setItem(key, next);
    setValue(next);
  };
  return [value, choose];
}
