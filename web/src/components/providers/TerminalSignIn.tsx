import { signInTerminalId, type ProviderId } from "../../../../shared/protocol.ts";
import { TerminalPane } from "../TerminalPane.tsx";

export function TerminalSignIn({ provider, instanceId }: { provider: ProviderId; instanceId?: string }) {
  return (
    <div className="terminal-sign-in">
      <p className="provider-maintenance-note">Follow the steps below. A browser window may open to finish signing in.</p>
      <div className="terminal-sign-in-pane">
        <TerminalPane termId={signInTerminalId(provider, instanceId)} target={{ signIn: provider, ...(instanceId ? { instanceId } : {}) }} active />
      </div>
    </div>
  );
}
