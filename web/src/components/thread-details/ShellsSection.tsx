import { StopIcon, TerminalIcon } from "../icons/squares.tsx";
import { selectThread, useApp } from "../../lib/store.ts";
import { reportError } from "../../lib/api.ts";
import { shellStatus, stopShell, useListedShells } from "../../lib/shells.ts";
import type { ShellProcess } from "../../../../shared/protocol.ts";
import { DetailSplitRow } from "./DetailRow.tsx";

export function ShellsSection({ threadId, disabled }: { threadId: string; disabled: boolean }) {
  const running = useListedShells(threadId);
  const show = (shell: ShellProcess) => {
    selectThread(threadId);
    useApp.setState({ searchMessageId: null, searchShellId: shell.id });
  };
  if (!running.length) return null;
  return <div className="details-section" aria-label="Running shells">
    {running.map((shell) => <DetailSplitRow key={shell.id} icon={<TerminalIcon size={16} />} label={shell.command || "Shell command"} hint={shellStatus(shell)} title={shell.command} onClick={() => show(shell)} menuLabel="Shell actions" menu={[
      { id: "stop", label: "Stop shell", icon: <StopIcon size={13} />, danger: true, disabled: disabled || shell.status === "stopping", onSelect: () => void stopShell(shell.id).catch(reportError) },
    ]} />)}
  </div>;
}
