import type { GitFile } from "../../../../shared/protocol.ts";

export function isConflict(file: GitFile) {
  return (
    file.index === "U" ||
    file.work === "U" ||
    ["AA", "DD"].includes(file.index + file.work)
  );
}

export function fileLabel(file: GitFile, staged: boolean) {
  if (isConflict(file)) return "Conflict";
  if (file.untracked) return "New";
  return (
      {
        M: "Modified",
        A: "Added",
        D: "Deleted",
        R: "Renamed",
        C: "Copied",
        T: "Type changed",
      } as Record<string, string>
    )[staged ? file.index : file.work] ?? "Changed";
}

export function readableError(error: string) {
  if (/unable to auto-detect email|please tell me who you are/i.test(error))
    return "Set your Git name and email before making a commit.";
  if (/conflict|automatic merge failed/i.test(error))
    return "Some changes conflict. Review the affected files before continuing.";
  if (/would be overwritten/i.test(error))
    return "Commit or stash your local changes before switching.";
  if (/not fully merged/i.test(error))
    return "This branch has unmerged commits. Merge them before deleting the branch.";
  if (/authentication|permission denied|could not read username/i.test(error))
    return "Git couldn't authenticate with this remote. Check your Git credentials.";
  return (
    error
      .split("\n")
      .find((line) => line.trim() && !line.startsWith("Command failed:"))
      ?.replace(/^(fatal|error):\s*/i, "") ??
    "Git couldn't complete the action."
  );
}
