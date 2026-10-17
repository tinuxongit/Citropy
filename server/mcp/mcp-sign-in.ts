import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { origin } from "../config.ts";

export const SIGN_IN_PATH = "/mcp/oauth";

export interface SavedSignIn {
  /** A client registration only works with the redirect address it was made for. */
  redirectUrl?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
}

const waiting = new Map<string, McpSignIn>();

/** Signs Citropy in to one server with OAuth. The browser comes back to Citropy's own address. */
export class McpSignIn implements OAuthClientProvider {
  readonly serverId: string;
  #saved: () => SavedSignIn | undefined;
  #save: (signIn: SavedSignIn | undefined) => void;
  #opened: (url: string) => void;
  #verifier = "";
  #state = "";

  constructor(
    serverId: string,
    saved: () => SavedSignIn | undefined,
    save: (signIn: SavedSignIn | undefined) => void,
    opened: (url: string) => void,
  ) {
    this.serverId = serverId;
    this.#saved = saved;
    this.#save = save;
    this.#opened = opened;
  }

  get redirectUrl(): string {
    return `${origin}${SIGN_IN_PATH}`;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Citropy",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }

  state(): string {
    if (this.#state) waiting.delete(this.#state);
    this.#state = randomBytes(24).toString("base64url");
    waiting.set(this.#state, this);
    return this.#state;
  }

  clientInformation(): OAuthClientInformationMixed | undefined {
    const saved = this.#saved();
    return saved?.redirectUrl === this.redirectUrl ? saved.client : undefined;
  }

  saveClientInformation(client: OAuthClientInformationMixed): void {
    this.#save({ redirectUrl: this.redirectUrl, client });
  }

  tokens(): OAuthTokens | undefined {
    return this.#saved()?.tokens;
  }

  saveTokens(tokens: OAuthTokens): void {
    this.#save({ ...this.#saved(), tokens });
  }

  redirectToAuthorization(url: URL): void {
    this.#opened(url.href);
  }

  saveCodeVerifier(verifier: string): void {
    this.#verifier = verifier;
  }

  codeVerifier(): string {
    if (!this.#verifier) throw new Error("Start signing in again from Citropy's settings.");
    return this.#verifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery"): void {
    const saved = this.#saved();
    if (scope === "verifier") this.#verifier = "";
    else if (scope === "all") this.#save(undefined);
    else if (scope === "client") this.#save(saved?.tokens ? { tokens: saved.tokens } : undefined);
    else if (scope === "tokens" && saved) this.#save({ ...saved, tokens: undefined });
  }

  forget(): void {
    if (this.#state) waiting.delete(this.#state);
  }
}

/** The sign-in a browser came back for. Each state works once. */
export function returningSignIn(state: string): McpSignIn | undefined {
  const signIn = waiting.get(state);
  if (signIn) signIn.forget();
  return signIn;
}
