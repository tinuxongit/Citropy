import { CornerDownRightIcon } from "./icons/arrows.tsx";
import { CheckIcon } from "./icons/marks.tsx";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { loadThread, openOnEnvironment } from "../lib/actions.ts";
import { reportError } from "../lib/api.ts";
import { environmentId } from "../lib/environment.ts";
import { selectThread } from "../lib/store.ts";
import { groupSubagents } from "../lib/subagents.ts";
import { Collapsible } from "./Collapsible.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ThreadPulse } from "./ThreadPulse.tsx";
import { VirtualList } from "./VirtualList.tsx";

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
  const current = new Set(groupSubagents(children).current);
  const active = children.some((child) => activePaths.has(child.id));
  const listed = children.filter(
    (child) =>
      (active && current.has(child)) ||
      activePaths.has(child.id) ||
      selectedPath.has(child.id),
  );
  const shown = children.some((child) => activePaths.has(child.id) || selectedPath.has(child.id));
  if (!listed.length) return null;
  return (
    <Collapsible open={shown} className="thread-children">
      <div className="thread-children-list" aria-label={`Subagents for ${parent.title}`}>
        <VirtualList items={listed} itemKey="id" estimateSize={35} activeKey={listed.find(child => selectedPath.has(child.id))?.id}>
          {child => <>
            <button
              type="button"
              className="thread-child"
              data-active={child.id === activeThreadId}
              title={`${child.title} · ${child.status}`}
              onClick={() => {
                onConversation();
                if (environment !== environmentId()) void openOnEnvironment(environment, child.projectId, child.id).catch(reportError);
                else {
                  selectThread(child.id);
                  loadThread(child.id);
                }
              }}
            >
              <CornerDownRightIcon size={12} />
              <span className="subagent-icon">
                <ProviderIcon provider={child.provider} />
                <span className="subagent-parent-icon"><ProviderIcon provider={parent.provider} /></span>
              </span>
              <span className="truncate">{child.title}</span>
              {activePaths.has(child.id) ? (
                <ThreadPulse status={child.status} />
              ) : (
                <CheckIcon size={12} className="subagent-complete" />
              )}
            </button>
            <ThreadChildren {...props} parent={child} />
          </>}
        </VirtualList>
      </div>
    </Collapsible>
  );
}
