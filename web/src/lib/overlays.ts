export const OPEN_OVERLAYS = 'dialog[open], [role="menu"], [role="dialog"], [aria-modal="true"]';

export function movingAncestor(element: Element): boolean {
  return document.getAnimations().some((animation) => {
    const target = (animation.effect as KeyframeEffect | null)?.target;
    return animation.playState === "running" && target instanceof Element && target.contains(element);
  });
}
