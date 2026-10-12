import { useEffect, useRef, useState, type CSSProperties } from "react";
import { fitScale, useBrowserSurfaces } from "../lib/browser-surfaces.ts";

const PARKED_OFFSET = -100_000;

export type BrowserGuest = { id: string; partition: string; width: number; height: number; rendering: boolean };

type WebviewElement = HTMLElement & { getWebContentsId(): number };

export function BrowserGuests() {
  const [guests, setGuests] = useState<BrowserGuest[]>([]);
  const [covers, setCovers] = useState<Record<string, string | undefined>>({});
  useEffect(() => window.citropyDesktop!.onBrowserGuests(setGuests), []);
  useEffect(
    () => window.citropyDesktop!.onBrowserCover((id, image) => setCovers((current) => ({ ...current, [id]: image }))),
    [],
  );
  return (
    <>
      {guests.map((guest) => <Guest key={guest.id} guest={guest} cover={covers[guest.id]} />)}
      <div className="browser-guests-backing" />
    </>
  );
}

function Guest({ guest, cover }: { guest: BrowserGuest; cover?: string }) {
  const surface = useBrowserSurfaces((state) => state.byId[guest.id]);
  const view = useRef<WebviewElement>(null);
  const shown = Boolean(surface);
  const scale = surface ? fitScale(surface, guest.width) : 1;

  useEffect(() => {
    window.citropyDesktop!.browserPresented(guest.id, shown, scale);
  }, [guest.id, shown, scale]);

  useEffect(() => {
    const element = view.current!;
    const attach = () => window.citropyDesktop!.attachBrowser(guest.id, element.getWebContentsId());
    const focus = () => element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    element.addEventListener("dom-ready", attach);
    element.addEventListener("focus", focus);
    return () => {
      element.removeEventListener("dom-ready", attach);
      element.removeEventListener("focus", focus);
    };
  }, [guest.id]);

  const placement: CSSProperties = surface
    ? { left: surface.x, top: surface.y, width: surface.width, height: surface.height, zIndex: surface.layer }
    : {
        left: guest.rendering ? 0 : PARKED_OFFSET,
        top: guest.rendering ? 0 : PARKED_OFFSET,
        width: guest.width,
        height: guest.height,
        zIndex: -1,
        pointerEvents: "none",
      };

  return (
    <div className="browser-guest" style={placement} aria-hidden={shown ? undefined : true}>
      {/* Electron reads allowpopups when the guest attaches, and react-dom drops boolean values for unknown attributes. */}
      <webview
        ref={view}
        src="about:blank"
        partition={guest.partition}
        {...({ allowpopups: "true" } as object)}
        style={{ width: guest.width, height: guest.height, transform: `scale(${scale})` }}
      />
      {cover && <img className="browser-cover" data-browser-cover={guest.id} src={cover} alt="" />}
    </div>
  );
}
