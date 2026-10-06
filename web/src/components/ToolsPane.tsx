import { useMemo, useState } from "react";
import { VirtualList } from "./VirtualList.tsx";
import { Plug, Search, Check, Circle } from "lucide-react";
import { useApp } from "../lib/store.ts";

export function ToolsPane() {
  const tools = useApp((state) => state.tools);
  const threadId = useApp((state) => state.activeThreadId);
  const connection = useApp((state) =>
    threadId ? state.toolConnections[threadId] : undefined,
  );
  const connected = useApp((state) => state.connected);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const filtered = useMemo(() => tools.filter((tool) =>
    `${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()),
  ), [tools, query]);
  const ready = connected && connection?.connected;
  return (
    <div className="tools-pane scroll">
      <div className="panel-section-heading">
        <Plug size={19} className="panel-icon-tools" />
        <div>
          <h3>Citropy tools</h3>
          <p>Model Context Protocol</p>
        </div>
        <span className="tools-status" data-ready={ready}>
          {ready ? <Check size={13} /> : <Circle size={11} />}
          {ready ? "Connected" : "Ready to connect"}
        </span>
      </div>
      <p className="tools-explainer">
        {ready
          ? "Your provider can use these tools in this workspace. Actions follow the conversation's permission setting."
          : "Tools connect when a provider starts its next turn. Browser and terminal tabs are shared with you."}
      </p>
      <label className="tools-search">
        <Search size={14} />
        <input
          aria-label="Find a tool"
          placeholder="Find a tool…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <VirtualList className="tools-list" items={filtered} itemKey="name" estimateSize={44}>
        {(tool) => (
          <details className="tool-definition" open={expanded.has(tool.name)}>
            <summary onClick={(event) => {
              event.preventDefault();
              setExpanded((previous) => {
                const next = new Set(previous);
                if (next.has(tool.name)) next.delete(tool.name);
                else next.add(tool.name);
                return next;
              });
            }}>
              <span>{tool.name.replaceAll("_", " ")}</span>
              {tool.annotations?.readOnlyHint && <small>Read</small>}
            </summary>
            <p>{tool.description}</p>
          </details>
        )}
      </VirtualList>
    </div>
  );
}
