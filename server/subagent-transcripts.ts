import { store } from "./store.ts";
import { ThreadTranscript } from "./thread-transcript.ts";
import type { AgentEvent, TranscriptEvent } from "./providers/types.ts";

type Event<T extends AgentEvent["type"]> = Extract<AgentEvent, { type: T }>;

const RUNNING_STATUSES = new Set(["queued", "thinking", "working", "awaiting"]);

export class SubagentTranscripts {
  #parentId: string;
  #transcripts = new Map<string, ThreadTranscript>();

  constructor(parentId: string) {
    this.#parentId = parentId;
  }

  update(event: Event<"subagent">): void {
    store.updateSubagent(this.#parentId, event);
    if (!RUNNING_STATUSES.has(event.status)) this.#finish(event.id, event.status === "stopped");
  }

  record(event: Event<"subagent.activity">): void {
    const transcript = this.#transcripts.get(event.id) ?? this.#open(event.id);
    write(transcript, event.event);
  }

  finishAll(stopped: boolean): void {
    for (const id of this.#transcripts.keys()) this.#finish(id, stopped);
  }

  #open(id: string): ThreadTranscript {
    const child = store.findSubagent(this.#parentId, id);
    if (!child) throw new Error(`Subagent ${id} reported work before it started.`);
    const transcript = new ThreadTranscript(child);
    this.#transcripts.set(id, transcript);
    return transcript;
  }

  #finish(id: string, stopped: boolean): void {
    const transcript = this.#transcripts.get(id);
    if (!transcript) return;
    transcript.finish(stopped);
    transcript.closeMessage();
    this.#transcripts.delete(id);
  }
}

function write(transcript: ThreadTranscript, event: TranscriptEvent): void {
  switch (event.type) {
    case "block.start": return transcript.startBlock(event);
    case "block.delta": return void transcript.appendBlock(event);
    case "block.end": return transcript.endBlock(event);
    case "tool.start": return transcript.startTool(event);
    case "tool.input": return transcript.updateToolInput(event);
    case "tool.end": return transcript.endTool(event);
  }
}
