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
