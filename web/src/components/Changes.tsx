import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Collapsible } from "./Collapsible.tsx";
import { ChevronRight, GitCommitVertical, RotateCcw } from "./icons.ts";
import { DiffView } from "./DiffView.tsx";
import { FileIcon } from "./FileIcon.tsx";
import { LineCounts } from "./LineCounts.tsx";
import { groupGitFiles } from "../lib/git-files.ts";
import { commitAll, discardFile, fetchDiff, refreshGit } from "../lib/actions.ts";
import { scaled, useApp } from "../lib/store.ts";
import type { FilePatch, GitFile } from "../../../shared/protocol.ts";

function statusLabel(file: GitFile): string {
  if (file.untracked) return "new";
  const code = file.index !== " " ? file.index : file.work;
  if (code === "M") return "modified";
  if (code === "A") return "added";
  if (code === "D") return "deleted";
  if (code === "R") return "renamed";
  return "changed";
}

function Row({ file, projectId, active, open, onToggle, expanded, onExpand }: { file: GitFile; projectId: string; active: boolean; open: boolean; onToggle: () => void; expanded: boolean; onExpand: () => void }) {
  const [patch, setPatch] = useState<FilePatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active || !open) return;
    let cancelled = false;
    setError("");
    setLoading(true);
    void fetchDiff(projectId, file.path, file.staged).then((result) => {
      if (!cancelled) setPatch(result);
    }).catch((error: Error) => {
      if (!cancelled) {
        setPatch(null);
        setError(error.message);
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [active, open, projectId, file.path, file.staged, file.added, file.removed]);

  const name = file.path.split("/").pop() ?? file.path;
  const dir = file.path.slice(0, file.path.length - name.length).replace(/\/$/, "");

  return (
    <div className="change" data-open={open}>
      <div className="change-heading">
        <button className="change-head" type="button" title={`${file.path} · ${statusLabel(file)}`} aria-expanded={open} onClick={onToggle}>
          <ChevronRight size={12} className="change-chevron" />
          <span className="change-file">
            <FileIcon path={file.path} />
            <span className="change-name truncate">{name}</span>
            {dir && <span className="change-dir truncate">{dir}</span>}
          </span>
          <LineCounts added={file.added} removed={file.removed} />
          <span className="change-badge" data-kind={statusLabel(file)}>
            {statusLabel(file)}
          </span>
        </button>
        <button
          className="change-action"
          type="button"
          aria-label="Discard changes"
          title="Discard changes"
          onClick={() => discardFile(projectId, file.path)}
        >
          <RotateCcw size={12} />
        </button>
      </div>

      <Collapsible open={open} className="change-body">
        <div className="change-body-inner">
          {patch ? (
            <DiffView patch={patch} showHeader={false} limit={40} expanded={expanded} onExpand={onExpand} />
          ) : (
            <div className="change-loading">{loading ? "Reading diff…" : error || "No textual diff"}</div>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

export function Changes({ active = true }: { active?: boolean }) {
  const projectId = useApp((state) => state.activeProjectId);
  const git = useApp((state) => (projectId ? state.git[projectId] : undefined));
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [openFiles, setOpenFiles] = useState<Set<string>>(new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => groupGitFiles(git?.files ?? []).flatMap((group) => [
    { key: `group:${group.kind}`, group, file: undefined as GitFile | undefined },
    ...group.files.map((file) => ({ key: file.path, group: undefined, file })),
  ]), [git]);
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows]);
  const list = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.length,
    getScrollElement: () => viewport.current,
    getItemKey,
    estimateSize: () => scaled(34),
    overscan: 4,
    measureElement: (element) => element.offsetHeight,
  });

  useEffect(() => {
    if (active && projectId) refreshGit(projectId);
  }, [active, projectId]);

  if (!projectId) return <div className="pane-empty">Open a workspace first.</div>;
  if (!git) return <div className="pane-empty">Not a git repository.</div>;

  return (
    <div className="changes">
      <div className="changes-list scroll" ref={viewport}>
        {git.files.length === 0 && <div className="pane-empty">Working tree is clean.</div>}
        <div className="changes-rows" style={{ height: list.getTotalSize() }}>
          {list.getVirtualItems().map((item) => {
            const { file, group } = rows[item.index]!;
            return (
              <div className="changes-row" key={item.key} data-index={item.index} ref={list.measureElement} style={{ transform: `translateY(${item.start}px)` }}>
                {group ? <h3 className="change-category" data-kind={group.kind}>{group.label}<span>{group.files.length}</span></h3> : file && <Row file={file} projectId={projectId} active={active} open={openFiles.has(file.path)} expanded={expandedFiles.has(file.path)} onExpand={() => setExpandedFiles((previous) => new Set(previous).add(file.path))} onToggle={() => setOpenFiles((previous) => {
                  const next = new Set(previous);
                  if (next.has(file.path)) next.delete(file.path);
                  else next.add(file.path);
                  return next;
                })} />}
              </div>
            );
          })}
        </div>
      </div>

      {git.files.length > 0 && (
        <form
          className="commit"
          onSubmit={(event) => {
            event.preventDefault();
            if (!message.trim()) return;
            commitAll(projectId, [message.trim(), description.trim()].filter(Boolean).join("\n\n"));
            setMessage("");
            setDescription("");
          }}
        >
          <input
            className="commit-input"
            aria-label="Commit title"
            value={message}
            placeholder={`Commit ${git.files.length} file${git.files.length === 1 ? "" : "s"} on ${git.branch}`}
            onChange={(event) => setMessage(event.target.value)}
          />
          <button className="btn" type="submit" data-variant="primary" disabled={!message.trim()}>
            <GitCommitVertical size={13} />
            Commit
          </button>
          <details className="commit-description">
            <summary>Description <span>Optional</span></summary>
            <textarea aria-label="Commit description" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain why this change was made." />
          </details>
        </form>
      )}
    </div>
  );
}
