import { MinusIcon, PlusIcon } from "../icons/marks.tsx";
import { FileIcon } from "../FileIcon.tsx";
import { VirtualList } from "../VirtualList.tsx";
import { fileLabel } from "./files.ts";
import { groupGitFiles } from "../../lib/git-files.ts";
import type { GitSelection } from "./selection.ts";
import type { GitFile, GitOperation } from "../../../../shared/protocol.ts";

const ROW_HEIGHT = 34;

export function FileGroup({
  title,
  list,
  inIndex,
  disabled,
  selection,
  match,
  act,
  setSelection,
}: {
  title: string;
  list: GitFile[];
  inIndex: boolean;
  disabled: boolean;
  selection: GitSelection | null;
  match: (text: string) => boolean;
  act: (operation: GitOperation, value?: string, page?: number, remote?: string) => Promise<boolean>;
  setSelection: (value: GitSelection | null) => void;
}) {
  return (
    <section className="git-file-group">
      <header>
        <h3>
          {title}
          <span className="git-count">{list.length}</span>
        </h3>
        <button
          className="btn git-stage-all"
          disabled={disabled || !list.length}
          onClick={() => void act(inIndex ? "unstageAll" : "stageAll")}
        >
          {inIndex ? <MinusIcon size={14} /> : <PlusIcon size={14} />}
          {inIndex ? "Unstage all" : "Stage all"}
        </button>
      </header>
      {!list.length && (
        <p className="git-list-hint">
          {inIndex
            ? "Stage files to include them in your commit."
            : "No unstaged changes."}
        </p>
      )}
      {groupGitFiles(list.filter((file) => match(file.path)), inIndex).map((group) => (
        <div className="git-change-category" key={group.kind}>
          <h4 className="change-category" data-kind={group.kind}>{group.label}<span>{group.files.length}</span></h4>
          <VirtualList items={group.files} itemKey="path" estimateSize={ROW_HEIGHT}>
          {(file) => {
            const label = fileLabel(file, inIndex);
            const active =
              selection?.kind === "file" &&
              selection.path === file.path &&
              selection.staged === inIndex;
            const name = file.path.split("/").pop() ?? file.path;
            const directory = file.path.slice(0, -name.length);
            return (
              <div
                className="git-file-row"
                key={file.path}
                data-selected={active}
              >
                <button
                  className="git-file-name"
                  aria-pressed={active}
                  title={file.path + " · " + label}
                  onClick={() =>
                    setSelection({
                      kind: "file",
                      path: file.path,
                      staged: inIndex,
                    })
                  }
                >
                  <FileIcon path={file.path} />
                  <span className="git-file-label">
                    <strong className="truncate">{name}</strong>
                    {directory && <small className="truncate">{directory}</small>}
                  </span>
                  <span className="git-file-status" data-status={label}>
                    {label}
                  </span>
                </button>
                <button
                  className="icon-btn git-stage-button"
                  title={(inIndex ? "Unstage " : "Stage ") + file.path}
                  disabled={disabled}
                  onClick={() =>
                    void act(inIndex ? "unstage" : "stage", file.path)
                  }
                >
                  {inIndex ? <MinusIcon size={15} /> : <PlusIcon size={15} />}
                </button>
              </div>
            );
          }}
          </VirtualList>
        </div>
      ))}
    </section>
  );
}
