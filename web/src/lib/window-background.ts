import { useApp } from "./store.ts";

// The desktop window shows this color before the page draws on the next launch.
export function followWindowBackground(): void {
  const report = window.citropyDesktop?.windowBackground;
  if (!report) return;
  // The theme setters update the root attributes after the store, so read on the next frame.
  const send = () =>
    requestAnimationFrame(() => {
      const color = opaqueHex(getComputedStyle(document.body).backgroundColor);
      if (color) report(color);
    });
  send();
  useApp.subscribe((state, previous) => {
    if (
      state.theme !== previous.theme ||
      state.scheme !== previous.scheme ||
      state.customColor !== previous.customColor
    )
      send();
  });
}

// Electron only takes hex colors, so let a canvas convert the theme's oklch.
function opaqueHex(color: string): string | undefined {
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return undefined;
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha !== 255) return undefined;
  return `#${[red, green, blue].map((value) => value!.toString(16).padStart(2, "0")).join("")}`;
}
