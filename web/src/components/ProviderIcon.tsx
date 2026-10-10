import claude from "../assets/providers/claude-light.svg";
import codexLight from "../assets/providers/chatgpt-light.svg";
import codexDark from "../assets/providers/chatgpt-dark.svg";
import opencodeLight from "../assets/providers/opencode-light.svg";
import opencodeDark from "../assets/providers/opencode-dark.svg";
import antigravity from "../assets/providers/antigravity.png";
import { useApp } from "../lib/store.ts";
import type { ProviderId } from "../../../shared/protocol.ts";

const logos: Partial<Record<string, Record<"light" | "dark", string>>> = {
  claude: { light: claude, dark: claude },
  codex: { light: codexLight, dark: codexDark },
  opencode: { light: opencodeLight, dark: opencodeDark },
  antigravity: { light: antigravity, dark: antigravity },
};

export function ProviderIcon({ provider }: { provider: ProviderId }) {
  const scheme = useApp((state) => state.scheme);
  // Conversations saved by agents that Citropy no longer ships keep their old provider id.
  const logo = logos[provider];
  if (!logo) return <span className="provider-icon" data-provider={provider} aria-hidden="true" />;
  return (
    <img
      className="provider-icon"
      data-provider={provider}
      src={logo[scheme]}
      width={20}
      height={20}
      alt=""
      aria-hidden="true"
      style={{ flexShrink: 0, objectFit: "contain" }}
    />
  );
}
