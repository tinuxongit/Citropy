import { useLayoutEffect, useRef } from "react";

const rim = 1;

type Box = { left: number; top: number; width: number; height: number; radius: number };
type Tab = Box & { fillet: number };

function offsetWithin(node: HTMLElement, ancestor: HTMLElement) {
  let left = 0;
  let top = 0;
  for (let current = node; current !== ancestor; current = current.offsetParent as HTMLElement) {
    left += current.offsetLeft;
    top += current.offsetTop;
  }
  return { left, top };
}

function tabPath({ left, top, width, height, radius, fillet }: Tab, inset: number) {
  const right = left + width;
  const bottom = top + height;
  const corner = Math.max(radius - inset, 0);
  const sweep = fillet + inset;
  return `M${left - fillet} ${bottom + inset + 1}V${bottom + inset}A${sweep} ${sweep} 0 0 0 ${left + inset} ${bottom - fillet}V${top + inset + corner}A${corner} ${corner} 0 0 1 ${left + inset + corner} ${top + inset}H${right - inset - corner}A${corner} ${corner} 0 0 1 ${right - inset} ${top + inset + corner}V${bottom - fillet}A${sweep} ${sweep} 0 0 0 ${right + fillet} ${bottom + inset}V${bottom + inset + 1}Z`;
}

function svgMask(width: number, height: number, content: string) {
  const scale = window.devicePixelRatio;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width * scale}" height="${height * scale}" viewBox="0 0 ${width} ${height}">${content}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function frameMasks(width: number, height: number, shell: Box, tabs: Tab[], drawer?: Tab) {
  // The drawer is a tab hanging from the bottom edge, so it reuses the tab path mirrored.
  const bottom = shell.top + shell.height;
  const hanging = (inset: number) =>
    drawer
      ? `<path transform="matrix(1 0 0 -1 0 ${2 * bottom})" d="${tabPath({ ...drawer, top: bottom - drawer.height }, inset)}"/>`
      : "";
  const shapes = (fill: string, inset: number) =>
    `<g fill="${fill}"><rect x="${shell.left + inset}" y="${shell.top + inset}" width="${shell.width - 2 * inset}" height="${shell.height - 2 * inset}" rx="${Math.max(shell.radius - inset, 0)}"/>${tabs.map((tab) => `<path d="${tabPath(tab, inset)}"/>`).join("")}${hanging(inset)}</g>`;
  const ringMask = (thickness: number) =>
    svgMask(
      width,
      height,
      `<mask id="m">${shapes("#fff", 0)}${shapes("#000", thickness)}</mask><rect width="100%" height="100%" mask="url(#m)"/>`,
    );
  return {
    fill: svgMask(width, height, shapes("#000", 0)),
    ring: ringMask(rim),
  };
}

export function ComposerFrame() {
  const glassRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const glass = glassRef.current!;
    const ring = ringRef.current!;
    const shell = ring.parentElement!;
    const tabList = shell.querySelector<HTMLElement>(":scope > .composer-tabs")!;
    let geometry = "";
    let strip: HTMLElement | null = null;
    const draw = () => {
      const nextStrip = shell.parentElement!.querySelector<HTMLElement>(":scope > .composer-strip");
      if (nextStrip !== strip) {
        if (strip) resize.unobserve(strip);
        if (nextStrip) resize.observe(nextStrip);
        strip = nextStrip;
      }
      const fillet = parseFloat(getComputedStyle(tabList).paddingLeft);
      const tabs = [...tabList.querySelectorAll<HTMLElement>(".composer-tab, .composer-wide-tab")]
        .filter((tab) => tab.offsetParent)
        .map((tab) => {
          const style = getComputedStyle(tab);
          const transform = new DOMMatrixReadOnly(style.transform);
          const offset = offsetWithin(tab, shell);
          return {
            left: offset.left + transform.m41,
            top: offset.top,
            shift: transform.m42,
            width: tab.offsetWidth,
            height: tab.offsetHeight,
            radius: parseFloat(style.borderTopLeftRadius),
            fillet,
          };
        });
      const rise = Math.max(0, ...tabs.map((tab) => -tab.top));
      const visible = tabs
        .filter((tab) => tab.height > tab.shift)
        .map(({ shift, ...tab }) => {
          const height = tab.height - shift;
          return {
            ...tab,
            top: tab.top + shift + rise,
            height,
            radius: Math.min(tab.radius, height),
            fillet: Math.min(tab.fillet, height),
          };
        });
      const shellBox = {
        left: 0,
        top: rise,
        width: shell.offsetWidth,
        height: shell.offsetHeight,
        radius: parseFloat(getComputedStyle(shell).borderTopLeftRadius),
      };
      const drawer = strip?.offsetHeight
        ? {
            left: strip.offsetLeft - shell.offsetLeft,
            top: 0,
            width: strip.offsetWidth,
            height: strip.offsetHeight,
            radius: parseFloat(getComputedStyle(strip).borderBottomLeftRadius),
            fillet: Math.min(fillet, strip.offsetHeight),
          }
        : undefined;
      const drop = drawer?.height ?? 0;
      const nextGeometry = JSON.stringify([shellBox, visible, drawer, window.devicePixelRatio]);
      if (nextGeometry === geometry) return;
      geometry = nextGeometry;
      const masks = frameMasks(
        shellBox.width,
        rise + shellBox.height + drop,
        shellBox,
        visible,
        drawer,
      );
      for (const layer of [glass, ring]) {
        layer.style.top = `${-rise}px`;
        layer.style.bottom = `${-drop}px`;
      }
      glass.style.maskImage = masks.fill;
      ring.style.maskImage = masks.ring;
    };
    const resize = new ResizeObserver(draw);
    draw();
    resize.observe(shell);
    resize.observe(tabList);
    const mutation = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === "childList" ||
            (record.target as Element).matches(".composer-tab, .composer-wide-tab"),
        )
      )
        draw();
    });
    mutation.observe(tabList, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style"],
    });
    const column = new MutationObserver(draw);
    column.observe(shell.parentElement!, { childList: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
      column.disconnect();
    };
  }, []);
  return (
    <>
      <span ref={glassRef} className="composer-glass" aria-hidden="true" />
      <span ref={ringRef} className="composer-focus-ring" aria-hidden="true" />
    </>
  );
}
