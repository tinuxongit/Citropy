import { useState } from "react";
import type { ProviderInfo } from "../../../../shared/protocol.ts";
import { api } from "../../lib/api.ts";
import { confirmAction } from "../../lib/store.ts";

export function useAccountSignIn(provider: ProviderInfo, instanceId: string | undefined, onChange: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const request = async (path: string, method: "POST" | "DELETE", extra: Record<string, string> = {}) => {
    setBusy(true);
    setError("");
    try {
      await api(path, { method, body: JSON.stringify({ provider: provider.id, instanceId, ...extra }) });
      onChange();
      return true;
    } catch (cause) {
      setError((cause as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return {
    busy,
    error,
    clearError: () => setError(""),
    start: () => request("providers/sign-in", "POST"),
    cancel: () => request("providers/sign-in", "DELETE"),
    finish: (address: string) => request("providers/sign-in/address", "POST", { address }),
    signOut: async () => {
      if (!await confirmAction({ title: `Sign out of ${provider.label}?`, description: "This stops this account's active conversations.", label: "Sign out", danger: true })) return false;
      return request("providers/sign-out", "POST");
    },
  };
}
