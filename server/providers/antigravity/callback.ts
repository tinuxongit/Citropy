import type { AuthorizationRequest } from "./acp.ts";

const SETTINGS = {
  forwardTimeoutMs: 10_000,
};
const GOOGLE_ISSUER = "https://accounts.google.com";

function parseCallback(request: AuthorizationRequest, pasted: string): URL {
  const invalid = new Error("Paste the full address from the page Google opened after you signed in.");
  const text = pasted.trim();
  if (!URL.canParse(text)) throw invalid;
  const url = new URL(text);
  const redirect = new URL(request.redirectUri);
  const single = (name: string) => url.searchParams.getAll(name).length === 1;
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.origin !== redirect.origin || url.pathname !== redirect.pathname
    || url.username || url.password || url.hash) throw invalid;
  if (!single("state") || url.searchParams.get("state") !== request.state)
    throw new Error("This address belongs to a different sign-in. Start again and paste the newest address.");
  if (url.searchParams.getAll("code").length + url.searchParams.getAll("error").length !== 1) throw invalid;
  const issuer = url.searchParams.getAll("iss");
  if (issuer.length > 1 || (issuer.length === 1 && issuer[0] !== GOOGLE_ISSUER)) throw invalid;
  return url;
}

export async function forwardCallback(request: AuthorizationRequest, pasted: string): Promise<void> {
  const url = parseCallback(request, pasted);
  const target = new URL(`${url.pathname}${url.search}`, request.redirectUri);
  const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(SETTINGS.forwardTimeoutMs) });
  if (!response.ok) throw new Error(`Antigravity did not accept the sign-in address (status ${response.status}).`);
}
