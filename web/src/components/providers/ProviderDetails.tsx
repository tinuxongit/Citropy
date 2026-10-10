import type { ProviderInfo } from "../../../../shared/protocol.ts";
import { GLOBAL_INSTRUCTION_PROVIDERS, type ProviderMaintenance } from "../../../../shared/provider-settings.ts";
import { send } from "../../lib/socket.ts";
import { Select } from "../Select.tsx";
import { confirmStop } from "./confirm-stop.ts";

export function ProviderDetails({ provider, state, active, disabled, onEditInstructions }: {
  provider: ProviderInfo;
  state?: ProviderMaintenance;
  active: number;
  disabled: boolean;
  onEditInstructions: () => void;
}) {
  return (
    <div className="provider-details">
      {GLOBAL_INSTRUCTION_PROVIDERS.includes(provider.id) && (
        <div className="provider-detail-row">
          <span><strong>Global instructions</strong><small>Instructions every {provider.label} chat follows.</small></span>
          <button type="button" className="btn" disabled={disabled} onClick={onEditInstructions}>Edit</button>
        </div>
      )}
      {provider.openCodeVersion && (
        <div className="provider-detail-row">
          <span><strong>OpenCode version</strong><small>{provider.openCodeVersion.active ? `Using OpenCode ${provider.openCodeVersion.active}` : "Version not detected"}</small></span>
          <Select aria-label="OpenCode version" value={String(provider.openCodeVersion.setting)} disabled={disabled}
            options={[
              { value: "auto", label: "Detect automatically" },
              { value: "1", label: "OpenCode 1" },
              { value: "2", label: "OpenCode 2" },
            ]}
            onChange={async value => {
              if (!await confirmStop(active, "Switch OpenCode version?", "Switch version")) return;
              send({ t: "providers.opencodeVersion", setting: value === "auto" ? "auto" : value === "2" ? 2 : 1 });
            }} />
        </div>
      )}
      <div className="provider-detail-row">
        <span><strong>{state?.method ?? "Installation"}</strong><small title={state?.binaryPath}>{state?.binaryPath ?? provider.binary}</small></span>
      </div>
      {state?.reason && <p className="provider-maintenance-note">{state.reason}</p>}
      {state?.output && (
        <details className="provider-update-output">
          <summary>Last update output</summary>
          <code>{state.command}</code>
          <pre className="scroll">{state.output}</pre>
        </details>
      )}
    </div>
  );
}
