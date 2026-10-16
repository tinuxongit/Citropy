import { useEffect } from "react";

const CONTROL = "button, a[href]";

// Buttons shrink while pressed, so a press near an edge can end just outside the button.
// The browser then sends the click to their shared parent and the button never hears it.
// If the release is still inside the button as it was when pressed, deliver the click to the button.
export function useForgivingPresses(): void {
  useEffect(() => {
    let press: { control: HTMLElement; box: DOMRect } | undefined;
    const down = (event: PointerEvent) => {
      const control =
        event.button === 0 && event.target instanceof Element
          ? event.target.closest<HTMLElement>(CONTROL)
          : null;
      press = control ? { control, box: control.getBoundingClientRect() } : undefined;
    };
    const click = (event: MouseEvent) => {
      const pressed = press;
      press = undefined;
      if (!pressed || event.detail === 0 || !(event.target instanceof Node)) return;
      const { control, box } = pressed;
      if (!control.isConnected || control.matches(":disabled")) return;
      if (control.contains(event.target) || !event.target.contains(control)) return;
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        return;
      event.stopPropagation();
      event.preventDefault();
      control.dispatchEvent(new MouseEvent("click", event));
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("click", click, true);
    };
  }, []);
}
