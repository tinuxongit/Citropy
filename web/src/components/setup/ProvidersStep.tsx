import { useApp } from "../../lib/store.ts";
import { useProviderMaintenance } from "../providers/use-provider-maintenance.ts";
import { useTerminalSignIns } from "../providers/use-provider-sign-ins.ts";
import { ProviderSetupCard } from "./ProviderSetupCard.tsx";

export function ProvidersStep() {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const { maintenance, error: maintenanceError, updating, update } = useProviderMaintenance();
  const signIns = useTerminalSignIns();

  return (
    <div className="setup-providers">
      {providers.map(provider => (
        <ProviderSetupCard
          key={provider.id}
          provider={provider}
          maintenance={maintenance.find(entry => entry.provider === provider.id)}
          signIns={signIns}
          busy={!connected || updating}
          onInstall={() => void update(provider)}
        />
      ))}
      {(signIns.error || maintenanceError) && <p className="dialog-error" role="alert">{signIns.error || maintenanceError}</p>}
    </div>
  );
}
