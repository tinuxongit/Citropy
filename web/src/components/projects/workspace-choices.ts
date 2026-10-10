import { FolderIcon } from "../icons/folders.tsx";
import { BranchIcon, ForkIcon } from "../icons/git.tsx";
import type { WorkspaceChoice } from "../../../../shared/protocol.ts";

export const WORKSPACE_CHOICES: Array<{ id: WorkspaceChoice["kind"]; label: string; detail: string; icon: typeof FolderIcon }> = [
  { id: "current", label: "Current folder", detail: "Use the project's existing checkout.", icon: FolderIcon },
  { id: "new", label: "New worktree", detail: "A separate branch and folder for this conversation.", icon: ForkIcon },
  { id: "existing", label: "Existing worktree", detail: "Continue in a worktree you already have.", icon: BranchIcon },
];
