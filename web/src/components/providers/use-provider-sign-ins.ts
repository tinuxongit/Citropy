import { useCallback, useEffect, useState } from "react";
import type { ProviderId } from "../../../../shared/protocol.ts";
import type { ProviderSignIn, SignInFlow } from "../../../../shared/provider-settings.ts";
import { api } from "../../lib/api.ts";
import { useApp } from "../../lib/store.ts";

const SETTINGS = {
  pollMs: 2000,
};

const ACTIVE_FLOWS = new Set<SignInFlow["status"]>(["starting", "waiting", "verifying"]);

export function isFlowActive(flow: SignInFlow | undefined): boolean {
  return Boolean(flow && ACTIVE_FLOWS.has(flow.status));
}

export function signInFor(signIns: ProviderSignIn[], provider: ProviderId, instanceId?: string): ProviderSignIn | undefined {
  return signIns.find(entry => entry.provider === provider && entry.instanceId === instanceId);
}

export function useProviderSignIns(watching = false, only: ProviderId[] = []) {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const [signIns, setSignIns] = useState<ProviderSignIn[]>([]);
  const [error, setError] = useState("");
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads(value => value + 1), []);
  const query = only.map(id => `provider=${id}`).join("&");

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const value = await api<ProviderSignIn[]>(`providers/sign-in${query ? `?${query}` : ""}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setSignIns(value);
        setError("");
        if (watching || value.some(entry => isFlowActive(entry.flow))) timer = setTimeout(() => void load(), SETTINGS.pollMs);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [connected, providers, watching, reloads, query]);

  return { signIns, error, reload };
}
