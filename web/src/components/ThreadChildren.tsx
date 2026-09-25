import { CornerDownRight } from "lucide-react";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { loadThread, openOnEnvironment } from "../lib/actions.ts";
import { reportError } from "../lib/api.ts";
import { environmentId } from "../lib/environment.ts";
import { selectThread } from "../lib/store.ts";
import { groupSubagents } from "../lib/subagents.ts";
import { Check } from "./icons.ts";
import { Collapsible } from "./Collapsible.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ThreadPulse } from "./ThreadPulse.tsx";
import { useI18n } from "../lib/i18n.ts";

interface Props {
  parent: ThreadMeta;
  environment: string;
  childrenByParent: Map<string, ThreadMeta[]>;
  selectedPath: Set<string>;
  activePaths: Set<string>;
  activeThreadId: string | null;
  onConversation: () => void;
}

export function ThreadChildren(props: Props) {
  const t = useI18n();
  const {
    parent,
    environment,
    childrenByParent,
    selectedPath,
    activePaths,
    activeThreadId,
    onConversation,
  } = props;
  const children = childrenByParent.get(parent.id) ?? [];
  const { current } = groupSubagents(children);
  const listed = children.filter(
    (child) =>
      current.includes(child) ||
      activePaths.has(child.id) ||
      selectedPath.has(child.id),
  );
  const shown = children.some((child) => activePaths.has(child.id) || selectedPath.has(child.id));
  if (!listed.length) return null;
  return (
    <Collapsible open={shown} className="thread-children">
      <div className="thread-children-list" aria-label={t("Subagents for {title}", { title: parent.title })}>
        {listed.map((child) => (
          <div key={child.id}>
            <button
              type="button"
              className="thread-child"
              data-active={child.id === activeThreadId}
              title={`${child.title} · ${t(child.status)}`}
              onClick={() => {
                onConversation();
                if (environment !== environmentId()) void openOnEnvironment(environment, child.projectId, child.id).catch(reportError);
                else {
                  selectThread(child.id);
                  loadThread(child.id);
                }
              }}
            >
              <CornerDownRight size={12} />
              <span className="subagent-icon">
                <ProviderIcon provider={child.provider} />
                <span className="subagent-parent-icon"><ProviderIcon provider={parent.provider} /></span>
              </span>
              <span className="truncate">{child.title}</span>
              {activePaths.has(child.id) ? (
                <ThreadPulse status={child.status} />
              ) : (
                <Check size={12} className="subagent-complete" />
              )}
            </button>
            <ThreadChildren {...props} parent={child} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}
