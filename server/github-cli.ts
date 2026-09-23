import { execFile } from "node:child_process";

const environment = {
  ...process.env,
  GH_PROMPT_DISABLED: "1",
  GH_HOST: "github.com",
  GH_PAGER: "cat",
  NO_COLOR: "1",
  GIT_TERMINAL_PROMPT: "0",
};

export function command(
  binary: string,
  args: string[],
  input?: unknown,
  cwd?: string,
  timeout = 60_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      args,
      { cwd, timeout, maxBuffer: 12 * 1024 * 1024, env: environment },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout);
        if ((error as NodeJS.ErrnoException).code === "ENOENT")
          return reject(
            new Error(`${binary} is not installed on this computer.`),
          );
        const detail = stderr
          .trim()
          .replace(
            /gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+/g,
            "[redacted]",
          );
        reject(
          new Error(
            error.killed
              ? "GitHub request timed out. Refresh to check the result before retrying."
              : detail || error.message,
          ),
        );
      },
    );
    child.stdin?.on("error", () => {});
    child.stdin?.end(input === undefined ? undefined : JSON.stringify(input));
  });
}

export async function api<T>(
  endpoint: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const output = await command(
    "gh",
    [
      "api",
      "--hostname",
      "github.com",
      "--method",
      method,
      endpoint,
      ...(body === undefined ? [] : ["--input", "-"]),
    ],
    body,
  );
  return (output.trim() ? JSON.parse(output) : undefined) as T;
}

export async function all<T>(endpoint: string, key?: string): Promise<T[]> {
  const output = await command("gh", [
    "api",
    "--hostname",
    "github.com",
    "--paginate",
    "--slurp",
    endpoint,
  ]);
  const pages = JSON.parse(output) as Array<T[] | Record<string, T[]>>;
  return pages.flatMap((page) =>
    key ? ((page as Record<string, T[]>)[key] ?? []) : (page as T[]),
  );
}
