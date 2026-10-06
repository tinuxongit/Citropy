import { Square, Terminal } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { selectThread, useApp } from "../../lib/store.ts";
import { reportError } from "../../lib/api.ts";
import { isActiveShell, shellStatus, stopShell } from "../../lib/shells.ts";
import type { ShellProcess } from "../../../../shared/protocol.ts";
import { DetailSplitRow } from "./DetailRow.tsx";

export function ShellsSection({ threadId, disabled }: { threadId: string; disabled: boolean }) {
  const running = useApp(useShallow((state) => Object.values(state.shells)
    .filter((shell) => shell.threadId === threadId && isActiveShell(shell))
    .sort((a, b) => b.startedAt - a.startedAt)));
  const show = (shell: ShellProcess) => {
    selectThread(threadId);
    useApp.setState({ searchMessageId: null, searchShellId: shell.id });
  };
  if (!running.length) return null;
  return <div className="details-section" aria-label="Running shells">
    {running.map((shell) => <DetailSplitRow key={shell.id} icon={<Terminal size={16} />} label={shell.command || "Shell command"} hint={shellStatus(shell)} title={shell.command} onClick={() => show(shell)} menuLabel="Shell actions" menu={[
      { id: "stop", label: "Stop shell", icon: <Square size={13} />, danger: true, disabled: disabled || shell.status === "stopping", onSelect: () => void stopShell(shell.id).catch(reportError) },
    ]} />)}
  </div>;
}
