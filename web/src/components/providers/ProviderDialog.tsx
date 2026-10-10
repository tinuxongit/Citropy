import { AnimatePresence } from "motion/react";
import { useState } from "react";
import type { ProviderInfo, ProviderInstance } from "../../../../shared/protocol.ts";
import type { ProviderMaintenance } from "../../../../shared/provider-settings.ts";
import { ArrowUpToLineIcon, DownloadIcon } from "../icons/arrows.tsx";
import { CheckIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { Modal } from "../Modal.tsx";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { AccountDialog } from "./AccountDialog.tsx";
import { AccountList } from "./AccountList.tsx";
import { ProviderDetails } from "./ProviderDetails.tsx";
import { isInstalled, versionSummary } from "./provider-summary.ts";
import type { useTerminalSignIns } from "./use-provider-sign-ins.ts";

export function ProviderDialog({ provider, state, active, instances, signIns, disabled, updating, onUpdate, onEditInstructions, onSaved, onRemoved, onClose }: {
  provider: ProviderInfo;
  state?: ProviderMaintenance;
  active: number;
  instances: ProviderInstance[];
  signIns: ReturnType<typeof useTerminalSignIns>;
  disabled: boolean;
  updating: boolean;
  onUpdate: () => void;
  onEditInstructions: () => void;
  onSaved: (instance: ProviderInstance) => void;
  onRemoved: (id: string) => void;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<ProviderInstance>();
  const installing = state?.install ?? !provider.available;
  const isUpdating = state?.status === "updating";
  const installed = isInstalled(provider);
  const offerUpdate = isUpdating || installing || state?.updateStatus === "available";

  return (
    <>
      <Modal className="provider-dialog" title={provider.label} description={versionSummary(provider, state)}
        icon={<ProviderIcon provider={provider.id} />} onClose={onClose} footer={<>
          {offerUpdate && (
            <button type="button" className="btn dialog-footer-start" data-variant={installing ? "primary" : undefined}
              disabled={disabled || isUpdating || updating || !state?.available || active > 0}
              title={active ? "Finish or stop active conversations before updating." : state?.reason}
              onClick={onUpdate}>
              {isUpdating ? <Loader size={14} /> : installing ? <DownloadIcon size={14} /> : <ArrowUpToLineIcon size={14} />}
              {isUpdating ? (installing ? "Installing…" : "Updating…") : installing ? "Install" : `Update to ${state?.latestVersion ?? "the latest version"}`}
            </button>
          )}
          <button className="btn" data-cancel type="button" onClick={onClose}>Close</button>
        </>}>
        {provider.enabled && provider.modelsError && <p className="provider-update-result" data-status="error" role="status">{provider.modelsError}</p>}
        {state?.message && (
          <p className="provider-update-result" data-status={state.status} role={state.status === "error" ? "alert" : "status"}>
            {state.status === "success" && <CheckIcon size={14} />}{state.message}
          </p>
        )}
        <h3 className="provider-dialog-heading">Accounts</h3>
        {provider.enabled && installed
          ? <AccountList provider={provider} instances={instances} signIns={signIns} disabled={disabled} onSaved={onSaved} onRemoved={onRemoved} onEdit={setEditing} />
          : <p className="provider-maintenance-note">{installed ? `Turn on ${provider.label} to sign in and add accounts.` : `Install ${provider.label} to sign in.`}</p>}
        <h3 className="provider-dialog-heading">Settings</h3>
        <ProviderDetails provider={provider} state={state} active={active} disabled={disabled || isUpdating} onEditInstructions={onEditInstructions} />
      </Modal>
      <AnimatePresence>{editing && (
        <AccountDialog provider={provider} instance={editing} onClose={() => setEditing(undefined)}
          onSaved={saved => { onSaved(saved); setEditing(undefined); signIns.reload(); }} />
      )}</AnimatePresence>
    </>
  );
}
