import { useState } from "react";
import { GlobeIcon } from "./GlobeIcon.tsx";
import { faviconUrl } from "../lib/favicon.ts";

export function SiteIcon({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className="link-site-icon" data-loaded={loaded || undefined} aria-hidden="true">
      <GlobeIcon size={16} />
      <img
        className="link-favicon"
        src={faviconUrl(new URL(url).origin)}
        width={16}
        height={16}
        alt=""
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={(event) => {
          event.currentTarget.hidden = true;
          setLoaded(false);
        }}
      />
    </span>
  );
}
