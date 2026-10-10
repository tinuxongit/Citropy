import { useCallback, useEffect, useState } from "react";
import type { ProviderInfo } from "../../../../shared/protocol.ts";
import type { ProviderMaintenance } from "../../../../shared/provider-settings.ts";
import { api, reportError } from "../../lib/api.ts";
import { useApp } from "../../lib/store.ts";

const POLL_INTERVAL = 1000;

export function useProviderMaintenance() {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const [maintenance, setMaintenance] = useState<ProviderMaintenance[]>([]);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  const refresh = useCallback(() => setRefreshCount(value => value + 1), []);
  const updating = starting || maintenance.some((entry) => entry.status === "updating");

  useEffect(() => {
    if (!connected) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const load = async () => {
      setChecking(true);
      try {
        const value = await api<ProviderMaintenance[]>(
          `providers/maintenance${refreshCount > 0 && first ? "?refresh=1" : ""}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        first = false;
        setMaintenance(value);
        setError("");
        if (value.some((entry) => entry.status === "updating"))
          timer = setTimeout(() => void load(), POLL_INTERVAL);
      } catch (error) {
        if (!controller.signal.aborted) setError((error as Error).message);
      } finally {
        if (!controller.signal.aborted) setChecking(false);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [connected, refreshCount, providers]);

  const update = async (provider: ProviderInfo) => {
    setStarting(true);
    setMaintenance((previous) =>
      previous.map((entry) =>
        entry.provider === provider.id
          ? { ...entry, status: "updating", message: provider.available ? "Starting update…" : "Starting installation…" }
          : entry,
      ),
    );
    try {
      const value = await api<ProviderMaintenance>("providers/update", {
        method: "POST",
        body: JSON.stringify({ provider: provider.id }),
      });
      setMaintenance((previous) =>
        previous.map((entry) =>
          entry.provider === provider.id ? value : entry,
        ),
      );
    } catch (error) {
      reportError(error);
    } finally {
      setStarting(false);
      refresh();
    }
  };

  const updateAll = async () => {
    setStarting(true);
    try {
      const queued = await api<ProviderMaintenance[]>("providers/update-all", { method: "POST" });
      setMaintenance(previous => previous.map(entry => queued.find(state => state.provider === entry.provider) ?? entry));
    } catch (error) {
      reportError(error);
    } finally {
      setStarting(false);
      refresh();
    }
  };

  return { maintenance, error, checking, updating, refresh, update, updateAll };
}
