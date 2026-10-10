import { useEffect, useState } from "react";
import { signInTerminalId, type ProviderId } from "../../../../shared/protocol.ts";
import { send } from "../../lib/socket.ts";
import { useApp } from "../../lib/store.ts";
import { useProviderMaintenance } from "../providers/use-provider-maintenance.ts";
import { signInFor, useProviderSignIns } from "../providers/use-provider-sign-ins.ts";
import { ProviderSetupCard } from "./ProviderSetupCard.tsx";

export function ProvidersStep() {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const { maintenance, error: maintenanceError, updating, update } = useProviderMaintenance();
  const [signingIn, setSigningIn] = useState<ProviderId>();
  const { signIns, error, reload } = useProviderSignIns(Boolean(signingIn));

  useEffect(() => {
    if (signingIn && signInFor(signIns, signingIn)?.signedIn) setSigningIn(undefined);
  }, [signIns, signingIn]);

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
          signIn={signInFor(signIns, provider.id)}
          signingIn={signingIn === provider.id}
          busy={!connected || updating}
          onSignInChange={reload}
          onInstall={() => void update(provider)}
          onSignIn={() => setSigningIn(provider.id)}
          onCancelSignIn={() => setSigningIn(undefined)}
        />
      ))}
      {(error || maintenanceError) && <p className="dialog-error" role="alert">{error || maintenanceError}</p>}
    </div>
  );
}
