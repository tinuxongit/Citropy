import type { ServerEvent } from "../shared/protocol.ts";

const encodedEvents = new WeakMap<ServerEvent, string>();

export function encodeServerEvent(event: ServerEvent): string {
  let encoded = encodedEvents.get(event);
  if (encoded === undefined) {
    encoded = JSON.stringify(event);
    encodedEvents.set(event, encoded);
  }
  return encoded;
}

function transcriptEvent(event: ServerEvent): boolean {
  return event.t === "thread.messages" || event.t === "message.add" || event.t === "part.add" || event.t === "part.append" || event.t === "part.patch";
}

type PendingEvent = {
  event: ServerEvent;
  bytes: number;
  textEnd?: number;
  patchSizes?: { fields: Map<string, number>; bytes: number };
};

export class SocketStream {
  #after: number;
  #sequence: number;
  #threads: Set<string>;
  #events: PendingEvent[] = [];
  #replaceable = new Map<string, number>();
  #bytes = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #write: (message: string) => void;
  #history: (event: Extract<ServerEvent, { t: "thread.messages" }>) => ServerEvent;

  constructor(after: number, threads: string[], write: (message: string) => void, history: (event: Extract<ServerEvent, { t: "thread.messages" }>) => ServerEvent) {
    this.#after = after;
    this.#sequence = after;
    this.#threads = new Set(threads);
    this.#write = write;
    this.#history = history;
  }

  subscribe(ids: string[]): void {
    this.flush();
    this.#threads = new Set(ids);
  }

  include(id: string): void {
    this.flush();
    this.#threads.add(id);
  }

  push(event: ServerEvent): void {
    if (event.sequence === undefined) {
      this.flush();
      this.#write(encodeServerEvent(event));
      return;
    }
    this.#sequence = event.sequence;
    if (transcriptEvent(event) && "threadId" in event && typeof event.threadId === "string" && !this.#threads.has(event.threadId)) {
      this.#schedule();
      return;
    }
    if (event.t === "thread.messages") event = this.#history(event);
    const key = event.t === "part.patch" || event.t === "part.append"
      ? `${event.t}:${event.threadId}:${event.messageId}:${event.partId}`
      : event.t === "thread.upsert" ? `thread.upsert:${event.thread.id}` : undefined;
    const index = key === undefined ? undefined : this.#replaceable.get(key);
    const previous = index === undefined ? undefined : this.#events[index];
    let bytes: number;
    let textEnd = event.t === "part.append" && event.text.length ? event.text.charCodeAt(event.text.length - 1) : undefined;
    let patchSizes = previous?.patchSizes;
    if (previous && event.t === "part.patch" && previous.event.t === "part.patch") {
      if (!patchSizes) {
        const fields = new Map<string, number>();
        let patchBytes = 0;
        for (const [key, value] of Object.entries(previous.event.patch)) {
          const size = Buffer.byteLength(JSON.stringify({ [key]: value })) - 2;
          if (size) fields.set(key, size);
          patchBytes += size;
        }
        patchSizes = { fields, bytes: patchBytes + Math.max(0, fields.size - 1) };
      }
      const oldBytes = patchSizes.bytes;
      const oldCount = patchSizes.fields.size;
      for (const [key, value] of Object.entries(event.patch)) {
        const size = Buffer.byteLength(JSON.stringify({ [key]: value })) - 2;
        patchSizes.bytes += size - (patchSizes.fields.get(key) ?? 0);
        if (size) patchSizes.fields.set(key, size);
        else patchSizes.fields.delete(key);
      }
      patchSizes.bytes += Math.max(0, patchSizes.fields.size - 1) - Math.max(0, oldCount - 1);
      bytes = previous.bytes + patchSizes.bytes - oldBytes
        + String(event.sequence).length - String(previous.event.sequence).length;
      event = { ...event, patch: { ...previous.event.patch, ...event.patch } };
    } else if (previous && event.t === "part.append" && previous.event.t === "part.append") {
      bytes = previous.bytes + Buffer.byteLength(JSON.stringify(event.text)) - 2
        + String(event.sequence).length - String(previous.event.sequence).length;
      if (previous.textEnd !== undefined && previous.textEnd >= 0xd800 && previous.textEnd <= 0xdbff && event.text.charCodeAt(0) >= 0xdc00 && event.text.charCodeAt(0) <= 0xdfff) bytes -= 8;
      if (!event.text.length) textEnd = previous.textEnd;
      event = { ...event, text: previous.event.text + event.text };
    } else {
      bytes = Buffer.byteLength(encodeServerEvent(event));
    }
    const pending = { event, bytes, textEnd, patchSizes };
    if (previous) {
      this.#events[index!] = pending;
      this.#bytes -= previous.bytes;
    } else {
      if (event.t !== "thread.upsert") this.#replaceable.clear();
      if (key !== undefined) this.#replaceable.set(key, this.#events.length);
      this.#events.push(pending);
    }
    this.#bytes += bytes;
    if (this.#bytes >= 256 * 1024 || this.#events.length >= 256) this.flush();
    else this.#schedule();
  }

  #schedule(): void {
    this.#timer ??= setTimeout(() => this.flush(), 50);
    this.#timer.unref();
  }

  flush(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    if (this.#sequence === this.#after) return;
    const message = `{"t":"event.batch","after":${this.#after},"sequence":${this.#sequence},"events":[${this.#events.map(({ event }) => encodeServerEvent(event)).join(",")}]}`;
    this.#after = this.#sequence;
    this.#events = [];
    this.#replaceable.clear();
    this.#bytes = 0;
    this.#write(message);
  }

  close(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#events = [];
    this.#replaceable.clear();
  }
}
