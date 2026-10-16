import { useEffect, useId, useRef, useState } from "react";
import { PowerIcon } from "./icons/hardware.tsx";
import type { ProviderId } from "../../../shared/protocol.ts";
import { api, reportError } from "../lib/api.ts";
import { loadThread } from "../lib/actions.ts";
import { ago, duration } from "../lib/format.ts";
import { selectProject, selectRosterEntry, selectThread, useApp } from "../lib/store.ts";
import { useVisibleInterval } from "../lib/use-visible-interval.ts";
import { AgentsIcon } from "./icons/AgentsIcon.tsx";
import { ConversationsIcon } from "./icons/ConversationsIcon.tsx";
import { BotsIcon } from "./icons/bots.tsx";
import { ProviderIcon } from "./icons/ProviderIcon.tsx";
import { StripPeek } from "./StripPeek.tsx";

const SETTINGS = { pollMs: 5000, openPollMs: 2000 };

interface Agent {
  threadId: string;
  parentThreadId?: string;
  title: string;
  projectId: string;
  projectName: string;
  rosterId?: string;
  provider: ProviderId;
  model?: string;
  status: "working" | "waiting" | "idle";
  started: number;
  lastActive: number;
  memory?: number;
  cpu?: number;
}

const statusLabel = { working: "Working", waiting: "Waiting for you", idle: "Idle" } as const;

function megabytes(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

export function AgentsPanel() {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [busy, setBusy] = useState<string>();

  const load = () => api<{ agents: Agent[] }>(open ? "agents?usage=1" : "agents").then((value) => setAgents(value.agents)).catch((error) => console.error("Loading agents failed:", error));
  useEffect(() => { void load(); }, [open]);
  useVisibleInterval(load, open ? SETTINGS.openPollMs : SETTINGS.pollMs);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open]);

  const turnOff = (path: string, key: string) => {
    setBusy(key);
    api<{ agents: Agent[] }>(path, { method: "POST" }).then((value) => setAgents(value.agents)).catch(reportError).finally(() => setBusy(undefined));
  };
  const show = (agent: Agent) => {
    setOpen(false);
    if (agent.rosterId) return selectRosterEntry(agent.rosterId);
    useApp.setState({ activeView: useApp.getState().threads[agent.threadId]?.chat ? "chats" : "chat" });
    if (agent.projectId !== useApp.getState().activeProjectId) selectProject(agent.projectId);
    selectThread(agent.threadId);
    loadThread(agent.threadId);
  };
  const idle = agents.filter((agent) => agent.status === "idle").length;
  const titles = new Map(agents.map((agent) => [agent.threadId, agent.title]));
  const sections = ([["Conversations", ConversationsIcon, agents.filter((agent) => !agent.rosterId)], ["Bots", BotsIcon, agents.filter((agent) => agent.rosterId)]] as const).filter(([, , list]) => list.length);
  const row = (agent: Agent) => (
    <li key={agent.threadId} data-status={agent.status}>
      <ProviderIcon provider={agent.provider} />
      <button type="button" className="agents-thread" onClick={() => show(agent)} title={agent.rosterId ? "Open bot" : "Open conversation"}>
        <strong className="truncate">{agent.title}</strong>
        <small className="truncate">
          {agent.parentThreadId ? `${`Subagent of ${titles.get(agent.parentThreadId) ?? "another chat"}`} · ` : agent.rosterId ? "" : `${agent.projectName} · `}
          {statusLabel[agent.status]}
          {agent.status === "idle" ? ` ${ago(agent.lastActive)}` : ` · ${duration(Date.now() - agent.started)}`}
          {agent.memory !== undefined && ` · ${megabytes(agent.memory)}`}
        </small>
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Turn off ${agent.title}`}
        title={agent.status === "idle" ? "Turn off" : "Stop and turn off"}
        disabled={busy !== undefined}
        onClick={() => turnOff(`agents/turn-off?threadId=${encodeURIComponent(agent.threadId)}`, agent.threadId)}
      >
        <PowerIcon size={14} />
      </button>
    </li>
  );

  return (
    <div className="agents-control" ref={wrap} onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
      <button
        ref={trigger}
        type="button"
        className="strip-action"
        aria-label={`Running agents, ${agents.length}`}
        title={open ? undefined : "Running agents"}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="strip-action-face">
          <AgentsIcon size={18} />
          {agents.length > 0 && <span className="agents-count" aria-hidden="true">{agents.length}</span>}
        </span>
      </button>
      <StripPeek anchor={trigger.current} open={open} className="agents-peek" id={id} role="dialog" aria-label="Running agents">
        {agents.length === 0 ? (
          <p>No agents are running. An agent starts when you send a message and stays ready for an hour after it goes quiet.</p>
        ) : (
          <div className="agents-sections">
            {sections.map(([label, Icon, list]) => (
              <section key={label} aria-label={label}>
                {sections.length > 1 && <h3><Icon size={16} />{label}</h3>}
                <ul className="agents-list">
                  {list.map(row)}
                </ul>
              </section>
            ))}
          </div>
        )}
        {idle > 0 && (
          <button type="button" className="btn" disabled={busy !== undefined} onClick={() => turnOff("agents/turn-off-idle", "idle")}>
            <PowerIcon size={14} />Turn off idle agents ({idle})
          </button>
        )}
      </StripPeek>
    </div>
  );
}
