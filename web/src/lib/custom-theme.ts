import type { Scheme } from "./app-state.ts";

export const DEFAULT_CUSTOM_COLOR = "#4f8cff";

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));
}

function mix(color: string, base: string, amount: number): string {
  const top = channels(color);
  return `#${channels(base).map((value, index) => Math.round(value + (top[index]! - value) * amount).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const linear = value / 255;
    return linear <= 0.03928 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function rgba(hex: string, alpha: number): string {
  return `rgba(${channels(hex).join(", ")}, ${alpha})`;
}

function readableText(accent: string, scheme: Scheme): string {
  if (scheme === "dark") return luminance(accent) < 0.12 ? mix("#ffffff", accent, 0.45) : mix("#ffffff", accent, 0.22);
  return luminance(accent) > 0.18 ? mix("#000000", accent, 0.4) : accent;
}

function customThemeTokens(accent: string, scheme: Scheme): Record<string, string> {
  if (!isHexColor(accent)) throw new Error(`custom color must be #rrggbb, got ${accent}`);
  return {
    accent,
    "on-accent": luminance(accent) > 0.3 ? "#161616" : "#ffffff",
    "accent-hover": mix(scheme === "dark" ? "#ffffff" : "#000000", accent, 0.18),
    "accent-soft": rgba(accent, scheme === "dark" ? 0.12 : 0.1),
    "accent-line": rgba(accent, 0.36),
    "accent-text": readableText(accent, scheme),
  };
}

export function applyCustomColor(accent: string, scheme: Scheme): void {
  for (const [name, value] of Object.entries(customThemeTokens(accent, scheme)))
    document.documentElement.style.setProperty(`--custom-${name}`, value);
}
