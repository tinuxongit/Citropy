import { CACHE_BYTES, CACHE_ENTRIES } from "./highlight-settings.ts";
import { rawCode } from "./raw-code.ts";

const WORKER_DEADLINE_MS = 30_000;
const WORKER_IDLE_MS = 60_000;

export interface HighlightRequest {
  id: number;
  kind: "html" | "tokens";
  code: string;
  lang?: string;
  theme: "dark" | "light";
}

type Result = string | string[] | null;
let worker: Worker | undefined;
let sequence = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
const pending = new Map<number, (result: Result) => void>();

function dispose(): void {
  worker?.terminate();
  worker = undefined;
  for (const finish of pending.values()) finish(null);
  clearTimeout(idle);
  idle = undefined;
}

async function render(
  request: Omit<HighlightRequest, "id">,
  signal?: AbortSignal,
): Promise<Result> {
  if (signal?.aborted) return null;
  if (typeof Worker === "undefined") {
    if (import.meta.env?.SSR === false) return null;
    const core = await import("./highlight-core.ts");
    return request.kind === "html"
      ? core.highlight(request.code, request.lang, request.theme)
      : core.highlightTokens(request.code, request.lang, request.theme);
  }
  if (!worker) {
    try {
      worker = new Worker(new URL("./highlight.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<{ id: number; result: Result }>) => {
        pending.get(event.data.id)?.(event.data.result);
      };
      worker.onerror = dispose;
      worker.onmessageerror = dispose;
    } catch (error) {
      console.error("Starting the code highlighter failed:", error);
      return null;
    }
  }
  clearTimeout(idle);
  const id = ++sequence;
  return new Promise((resolve) => {
    const timeout = setTimeout(dispose, WORKER_DEADLINE_MS);
    const finish = (result: Result) => {
      if (!pending.delete(id)) return;
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      resolve(result);
      if (!pending.size && worker) idle = setTimeout(dispose, WORKER_IDLE_MS);
    };
    const cancel = () => {
      worker?.postMessage({ cancel: id });
      finish(null);
    };
    pending.set(id, finish);
    signal?.addEventListener("abort", cancel, { once: true });
    try { worker!.postMessage({ ...request, id }); }
    catch (error) {
      console.error("Sending code to the highlighter failed:", error);
      dispose();
    }
  });
}

const cache = new Map<string, { result: string | string[]; bytes: number }>();
const inflight = new Map<string, { controller: AbortController; result: Promise<Result>; consumers: number }>();
let cacheSize = 0;

function remember(key: string, result: string | string[]): void {
  if (cache.has(key)) return;
  const size = key.length * 2 + (typeof result === "string" ? result.length * 2 : result.reduce((total, line) => total + line.length * 2 + 16, 0));
  if (size > CACHE_BYTES) return;
  while (cache.size >= CACHE_ENTRIES || cacheSize + size > CACHE_BYTES) {
    const [oldKey, entry] = cache.entries().next().value!;
    cache.delete(oldKey);
    cacheSize -= entry.bytes;
  }
  cache.set(key, { result: typeof result === "string" ? result : [...result], bytes: size });
  cacheSize += size;
}

function sharedRender(key: string, request: Omit<HighlightRequest, "id">, signal?: AbortSignal): Promise<Result> {
  if (signal?.aborted) return Promise.resolve(null);
  let entry = inflight.get(key);
  if (!entry) {
    const controller = new AbortController();
    const created = { controller, result: render(request, controller.signal), consumers: 0 };
    created.result = created.result.finally(() => {
      if (inflight.get(key) === created) inflight.delete(key);
    });
    entry = created;
    inflight.set(key, entry);
  }
  const current = entry;
  current.consumers++;
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: Result, error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", cancel);
      current.consumers--;
      if (error !== undefined) reject(error);
      else resolve(result);
    };
    const cancel = () => {
      finish(null);
      if (!current.consumers) {
        if (inflight.get(key) === current) inflight.delete(key);
        current.controller.abort();
      }
    };
    signal?.addEventListener("abort", cancel, { once: true });
    current.result.then(result => finish(result), error => finish(null, error));
    if (signal?.aborted) cancel();
  });
}

export async function highlight(code: string, lang: string | undefined, theme: "dark" | "light", signal?: AbortSignal): Promise<string> {
  const key = `html\0${theme}\0${lang ?? ""}\0${code}`;
  const cached = cache.get(key);
  if (cached && typeof cached.result === "string") {
    cache.delete(key);
    cache.set(key, cached);
    return cached.result;
  }
  const result = await sharedRender(key, { kind: "html", code, lang, theme }, signal);
  if (typeof result !== "string") return rawCode(code);
  remember(key, result);
  return result;
}

export async function highlightTokens(code: string, lang: string | undefined, theme: "dark" | "light", signal?: AbortSignal): Promise<string[] | null> {
  if (signal?.aborted) return null;
  const key = `tokens\0${theme}\0${lang ?? ""}\0${code}`;
  const cached = cache.get(key);
  if (cached && Array.isArray(cached.result)) {
    cache.delete(key);
    cache.set(key, cached);
    return [...cached.result];
  }
  const result = await sharedRender(key, { kind: "tokens", code, lang, theme }, signal);
  if (!Array.isArray(result)) return null;
  remember(key, result);
  return [...result];
}

if (import.meta.hot) import.meta.hot.dispose(dispose);
