export function repositoryName(value: string): string {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value) ||
    [".", ".."].includes(value.split("/")[1]!)
  )
    throw new Error("Choose a GitHub repository in owner/name format.");
  return value;
}

export function repositoryFromRemote(value: string): string | null {
  const match =
    /^(?:https?:\/\/(?:[^/@]+@)?github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([^/]+\/[^/]+?)\/?$/i.exec(
      value.trim(),
    );
  if (!match) return null;
  try {
    return repositoryName(match[1]!.replace(/\.git$/, ""));
  } catch {
    return null;
  }
}

export function positive(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error("Invalid GitHub item number.");
  return value;
}

export function text(value: string, label: string, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > 65_000 ||
    value.includes("\0") ||
    (required && !value.trim())
  )
    throw new Error(`Enter a valid ${label}.`);
  return value;
}

export function names(value: string[]): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Too many names.");
  return value.map((name) => text(name, "name", true).trim());
}

export function pageNumber(value?: number) {
  return positive(value ?? 1);
}
