import { useEffect, useState } from "react";
import type { ThreadMeta } from "../../../../shared/protocol.ts";
import type { ProviderCommand, SkillInfo } from "../../../../shared/features.ts";
import { api } from "../../lib/api.ts";

const PATH_SEARCH_DELAY_MS = 120;

export type PathEntry = { path: string; dir: boolean };

export function useComposerCatalog({
  thread,
  mode,
  catalogMode,
  mentionText,
}: {
  thread: ThreadMeta;
  mode: "skills" | "commands" | undefined;
  catalogMode: "skills" | "commands" | undefined;
  mentionText: string;
}) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [paths, setPaths] = useState<PathEntry[]>([]);
  const [nativeCommands, setNativeCommands] = useState<ProviderCommand[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!catalogMode) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNativeCommands([]);
    const params = new URLSearchParams({
      projectId: thread.projectId,
      threadId: thread.id,
    });
    const readSkills = api<SkillInfo[]>(`skills?${params}`, {
      signal: controller.signal,
    }).then((value) => {
      if (!controller.signal.aborted) setSkills(value);
    });
    const requests =
      catalogMode === "commands"
        ? [
            readSkills,
            api<ProviderCommand[]>(`commands?${params}`, {
              signal: controller.signal,
            }).then((value) => {
              if (!controller.signal.aborted) setNativeCommands(value);
            }),
          ]
        : [readSkills];
    void Promise.all(requests)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalogMode, thread.id, thread.provider, thread.projectId]);
  useEffect(() => {
    if (mode !== "skills") { setPaths([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ threadId: thread.id, query: mentionText.split("#")[0]! });
      void api<PathEntry[]>(`threads/context?${params}`, { signal: controller.signal }).then(setPaths).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    }, PATH_SEARCH_DELAY_MS);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [mode, mentionText, thread.id]);
  return { skills, nativeCommands, paths, loading, error };
}
