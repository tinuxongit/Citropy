import { useState, type CSSProperties, type ReactNode } from "react";
import { ago, cost, tokens } from "../../lib/format.ts";
import { ProviderIcon } from "../ProviderIcon.tsx";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { Select } from "../Select.tsx";
import { FolderIcon } from "../icons/folders.tsx";
import { useApp } from "../../lib/store.ts";
import { measureOf } from "./usage-series.ts";
import { uncachedInput } from "../../../../shared/usage-metrics.ts";
import type { UsageReport } from "../../../../shared/features.ts";
import { useStoredChoice } from "../../lib/use-stored-choice.ts";

type Conversation = UsageReport["conversations"][number];

const ALL_PROJECTS = "";

const totalTokens = (entry: Conversation) => measureOf("tokens", entry.provider, entry.usage);

const SORTS = [
  { id: "recent", label: "Recent", value: (entry: Conversation) => entry.updatedAt },
  { id: "tokens", label: "Most tokens", value: totalTokens },
  { id: "cost", label: "Highest cost", value: (entry: Conversation) => entry.usage.costUsd },
] as const;

function breakdown(entry: Conversation): string {
  return [
    ["Input", uncachedInput(entry.provider, entry.usage)],
    ["Output", entry.usage.output],
    ["Cache read", entry.usage.cacheRead],
    ["Cache write", entry.usage.cacheWrite],
  ].map(([label, amount]) => `${label} ${tokens(amount as number)}`).join("\n");
}

export function ConversationUsage({ conversations, filter }: { conversations: Conversation[]; filter: ReactNode }) {
  const [sortId, setSort] = useStoredChoice("citropy.usageConversationSort", SORTS.map((entry) => entry.id), "recent");
  const sort = SORTS.find((entry) => entry.id === sortId)!;
  const [projectId, setProjectId] = useState(ALL_PROJECTS);
  const allProjects = useApp((state) => state.projects);
  const withUsage = conversations.filter((entry) => totalTokens(entry) > 0);
  const projects = allProjects.filter((project) => withUsage.some((entry) => entry.projectId === project.id));
  const projectName = (id: string) => allProjects.find((project) => project.id === id)?.name ?? "Removed project";
  const inProject = (entry: Conversation) => projectId === ALL_PROJECTS || entry.projectId === projectId;
  const used = withUsage.filter(inProject).sort((a, b) => sort.value(b) - sort.value(a));
  const unused = conversations.filter(inProject).length - used.length;
  const most = Math.max(0, ...used.map(totalTokens));
  return (
    <>
      <div className="usage-filters">
        <div className="usage-segmented sliding-selection" role="group" aria-label="Sort conversations">
          <SelectionHighlight value={sortId} />
          {SORTS.map((entry) => (
            <button key={entry.id} type="button" aria-pressed={sortId === entry.id} onClick={() => setSort(entry.id)}>{entry.label}</button>
          ))}
        </div>
        <Select
          className="usage-project-select"
          aria-label="Project"
          value={projectId}
          onChange={setProjectId}
          width={240}
          options={[
            { value: ALL_PROJECTS, label: "All projects" },
            ...projects.map((project) => ({ value: project.id, label: project.name, icon: <FolderIcon size={15} /> })),
          ]}
        />
        {filter}
      </div>
      {used.length > 0 ? (
        <ol className="usage-conversation-list">
          {used.map((entry) => {
            const amount = totalTokens(entry);
            return (
              <li key={entry.id} className="usage-conversation" data-series={entry.provider}>
                <span className="usage-conversation-mark"><ProviderIcon provider={entry.provider} /></span>
                <span className="usage-conversation-name">
                  <strong className="truncate">{entry.title}</strong>
                  <small className="truncate">{projectId === ALL_PROJECTS && `${projectName(entry.projectId)} · `}{entry.model || "Model not reported"} · {ago(entry.updatedAt)}</small>
                </span>
                <i className="usage-conversation-share" style={{ "--share": `${(amount / most) * 100}%` } as CSSProperties} />
                <span className="usage-conversation-amount" title={breakdown(entry)}>
                  <strong>{tokens(amount)}</strong>
                  <small>{entry.usage.costUsd ? cost(entry.usage.costUsd) : "No price"}</small>
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="usage-conversation-empty">No conversations with usage for these filters</p>
      )}
      {unused > 0 && <p className="settings-note">{unused === 1 ? "1 conversation" : `${unused} conversations`} with no usage yet {unused === 1 ? "is" : "are"} not listed.</p>}
    </>
  );
}
