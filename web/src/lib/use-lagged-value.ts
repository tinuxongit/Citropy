import { useEffect, useState } from "react";

export function useLaggedValue<T>(value: T, initial: T = value): T {
  const [lagged, setLagged] = useState(initial);
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setLagged(value));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [value]);
  return lagged;
}
