export type GitSelection =
  | { kind: "file"; path: string; staged: boolean }
  | { kind: "commit"; hash: string }
  | { kind: "stash"; ref: string };
