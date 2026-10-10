import { useEffect, useState } from "react";
import { signInTerminalId, type ProviderId } from "../../../../shared/protocol.ts";
import type { ProviderSignIn } from "../../../../shared/provider-settings.ts";
import { api } from "../../lib/api.ts";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";
import { useProviderMaintenance } from "../providers/use-provider-maintenance.ts";
import { ProviderSetupCard } from "./ProviderSetupCard.tsx";

const SIGN_IN_POLL = 3000;

export function ProvidersStep() {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const { maintenance, error: maintenanceError, updating, update } = useProviderMaintenance();
  const [signIns, setSignIns] = useState<ProviderSignIn[]>([]);
  const [signingIn, setSigningIn] = useState<ProviderId>();
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const value = await api<ProviderSignIn[]>("providers/sign-in", { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSignIns(value);
        setError("");
        if (signingIn && value.find(entry => entry.provider === signingIn)?.signedIn) setSigningIn(undefined);
        else if (signingIn) timer = setTimeout(() => void load(), SIGN_IN_POLL);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connected, providers, signingIn]);

  useEffect(() => {
    if (!signingIn) return;
    return () => { send({ t: "term.close", termId: signInTerminalId(signingIn) }); };
  }, [signingIn]);

  return (
    <div className="setup-providers">
      {providers.map(provider => (
        <ProviderSetupCard
          key={provider.id}
          provider={provider}
          maintenance={maintenance.find(entry => entry.provider === provider.id)}
          signIn={signIns.find(entry => entry.provider === provider.id)}
          signingIn={signingIn === provider.id}
          busy={!connected || updating}
          onInstall={() => void update(provider)}
          onSignIn={() => setSigningIn(provider.id)}
          onCancelSignIn={() => setSigningIn(undefined)}
        />
      ))}
      {(error || maintenanceError) && <p className="dialog-error" role="alert">{error || maintenanceError}</p>}
    </div>
  );
}
