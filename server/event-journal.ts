import { DatabaseSync, type StatementSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { dataRoot } from "./paths.ts";
import type { Message, ServerEvent, Thread } from "../shared/protocol.ts";

export class EventJournal {
  #connection?: DatabaseSync;
  #path: string;
  #statements = new Map<string, StatementSync>();
  #pending = new Map<string, Promise<ServerEvent[]>>();

  constructor(path: string) {
    this.#path = path;
  }

  get #db(): DatabaseSync {
    if (this.#connection) return this.#connection;
    if (this.#path !== ":memory:") mkdirSync(dirname(this.#path), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(this.#path);
    if (this.#path !== ":memory:") chmodSync(this.#path, 0o600);
    database.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;
      CREATE TABLE IF NOT EXISTS events (sequence INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, parent TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE INDEX IF NOT EXISTS document_parent ON documents(kind,parent,position);
      CREATE TABLE IF NOT EXISTS deleted_threads (id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT, created INTEGER NOT NULL);`);
    this.#connection = database;
    return database;
  }

  #statement(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (!statement) {
      statement = this.#db.prepare(sql);
      this.#statements.set(sql, statement);
    }
    return statement;
  }

  get sequence(): number {
    return Number(this.#statement("SELECT seq FROM sqlite_sequence WHERE name='events'").get()?.seq ?? 0);
  }

  #put(kind: string, id: string, parent: string, data: unknown): void {
    this.#statement("INSERT INTO documents VALUES (?,?,?,(SELECT coalesce(max(position),-1)+1 FROM documents WHERE kind=? AND parent=?),?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data").run(kind, id, parent, kind, parent, JSON.stringify(data));
  }

  #message(threadId: string, message: Message): void {
    const { parts, ...meta } = message;
    this.#put("message", message.id, threadId, meta);
    parts.forEach(part => this.#put("part", part.id, message.id, part));
  }

  #clearMessages(threadId: string): void {
    this.#statement("DELETE FROM documents WHERE kind='part' AND parent IN (SELECT id FROM documents WHERE kind='message' AND parent=?)").run(threadId);
    this.#statement("DELETE FROM documents WHERE kind='message' AND parent=?").run(threadId);
  }

  append(event: ServerEvent): number {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      const sequence = Number(this.#statement("INSERT INTO events(payload) VALUES (?)").run(JSON.stringify(event)).lastInsertRowid);
      if (event.t === "thread.upsert") this.#put("thread", event.thread.id, "", event.thread);
      else if (event.t === "message.add") this.#message(event.threadId, event.message);
      else if (event.t === "part.add") this.#put("part", event.part.id, event.messageId, event.part);
      else if (event.t === "part.append") this.#statement("UPDATE documents SET data=json_set(data,'$.text',coalesce(json_extract(data,'$.text'),'') || ?) WHERE kind='part' AND id=?").run(event.text, event.partId);
      else if (event.t === "part.patch") {
        const row = this.#statement("SELECT data FROM documents WHERE kind='part' AND id=?").get(event.partId);
        if (row) this.#statement("UPDATE documents SET data=? WHERE kind='part' AND id=?").run(JSON.stringify({ ...JSON.parse(String(row.data)), ...event.patch }), event.partId);
      } else if (event.t === "thread.messages") {
        this.#clearMessages(event.threadId);
        event.messages.forEach(message => this.#message(event.threadId, message));
      } else if (event.t === "thread.remove") {
        this.#clearMessages(event.id);
        this.#statement("DELETE FROM documents WHERE kind='thread' AND id=?").run(event.id);
        this.#statement("INSERT OR IGNORE INTO deleted_threads VALUES (?)").run(event.id);
      }
      if (sequence % 500 === 0) {
        this.#statement("DELETE FROM events WHERE sequence < ?").run(sequence - 5000);
        this.#db.exec("DELETE FROM events WHERE sequence IN (SELECT sequence FROM (SELECT sequence, sum(length(CAST(payload AS BLOB))) OVER (ORDER BY sequence DESC) AS bytes FROM events) WHERE bytes > 8388608)");
        this.#statement("DELETE FROM receipts WHERE created < ?").run(Date.now() - 30 * 86400_000);
      }
      this.#db.exec("COMMIT");
      return sequence;
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  hasThread(id: string): boolean {
    return Boolean(this.#statement("SELECT id FROM documents WHERE kind='thread' AND id=? UNION ALL SELECT id FROM deleted_threads WHERE id=?").get(id, id));
  }

  importThreads(threads: Iterable<Thread>): void {
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      for (const thread of threads) {
        if (this.hasThread(thread.id)) continue;
        const { messages, ...meta } = thread;
        this.#put("thread", thread.id, "", meta);
        messages.forEach(message => this.#message(thread.id, message));
      }
      this.#db.exec("COMMIT");
    } catch (error) { this.#db.exec("ROLLBACK"); throw error; }
  }

  threadRecords(): Omit<Thread, "messages">[] {
    return this.#statement("SELECT data FROM documents WHERE kind='thread'").all().map(row => JSON.parse(String(row.data)));
  }

  messages(threadId: string): Message[] {
    const messages: Message[] = [];
    for (const message of this.#statement("SELECT id,data FROM documents WHERE kind='message' AND parent=? ORDER BY position").iterate(threadId)) {
      const parts: Message["parts"] = [];
      for (const part of this.#statement("SELECT data FROM documents WHERE kind='part' AND parent=? ORDER BY position").iterate(String(message.id)))
        parts.push(JSON.parse(String(part.data)));
      messages.push({ ...JSON.parse(String(message.data)), parts });
    }
    return messages;
  }

  messageTexts(threadId: string): Array<{ id: string; text: string }> {
    const texts: Array<{ id: string; text: string }> = [];
    for (const row of this.#statement("SELECT m.id AS id, json_extract(p.data,'$.text') AS text FROM documents m CROSS JOIN documents p ON p.kind='part' AND p.parent=m.id WHERE m.kind='message' AND m.parent=? AND json_extract(p.data,'$.kind')='text' ORDER BY m.position, p.position").iterate(threadId)) {
      const last = texts.at(-1);
      if (last && last.id === row.id) last.text += ` ${row.text}`;
      else texts.push({ id: String(row.id), text: String(row.text) });
    }
    return texts;
  }

  lastMessageTimes(): Map<string, number> {
    return new Map(this.#statement("SELECT parent, json_extract(data,'$.ts') AS ts, max(position) FROM documents WHERE kind='message' GROUP BY parent").all().map(row => [String(row.parent), Number(row.ts)]));
  }

  changedFileCounts(): Map<string, number> {
    return new Map(this.#statement(`WITH edits AS (
        SELECT m.parent AS thread, p.data AS data FROM documents m JOIN documents p ON p.kind='part' AND p.parent=m.id
        WHERE m.kind='message' AND json_extract(p.data,'$.kind')='tool' AND json_extract(p.data,'$.status')='ok' AND json_extract(p.data,'$.shape') IN ('edit','write'))
      SELECT thread, count(DISTINCT path) AS count FROM (
        SELECT thread, j.value AS path FROM edits, json_each(edits.data,'$.input.paths') j WHERE json_type(edits.data,'$.input.paths')='array'
        UNION ALL
        SELECT thread, coalesce(json_extract(data,'$.input.file_path'), json_extract(data,'$.input.filePath'), json_extract(data,'$.input.path')) FROM edits WHERE json_type(data,'$.input.paths') IS NOT 'array')
      WHERE typeof(path)='text' AND path!='' GROUP BY thread`).all().map(row => [String(row.thread), Number(row.count)]));
  }

  unsettledThreads(): Set<string> {
    return new Set(this.#statement(`SELECT DISTINCT m.parent AS thread FROM documents p JOIN documents m ON m.kind='message' AND m.id=p.parent WHERE p.kind='part' AND (
        (json_extract(p.data,'$.kind')='question' AND json_extract(p.data,'$.status')='pending') OR
        (json_extract(p.data,'$.kind') IN ('text','reasoning') AND json_extract(p.data,'$.complete') IS NOT 1) OR
        (json_extract(p.data,'$.kind')='tool' AND json_extract(p.data,'$.status')='running') OR
        json_extract(p.data,'$.kind')='todo')`).all().map(row => String(row.thread)));
  }

  replay(after: number): ServerEvent[] | null {
    const first = Number(this.#statement("SELECT min(sequence) AS value FROM events").get()!.value ?? this.sequence + 1);
    if (!Number.isSafeInteger(after) || after < first - 1 || after > this.sequence) return null;
    return this.#statement("SELECT sequence,payload FROM events WHERE sequence > ? ORDER BY sequence").all(after).map(row => ({ ...JSON.parse(String(row.payload)), sequence: Number(row.sequence) }));
  }

  async request(id: string, input: unknown, execute: () => Promise<ServerEvent[]>): Promise<ServerEvent[]> {
    if (!id || id.length > 200) throw new Error("Invalid request identifier.");
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const previous = this.#statement("SELECT fingerprint,response FROM receipts WHERE id=?").get(id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new Error("This request identifier was already used for another action.");
      if (previous.response) return JSON.parse(String(previous.response));
      const pending = this.#pending.get(id);
      if (pending) return pending;
      throw new Error("Citropy restarted during this request. Check its result before trying again.");
    }
    this.#statement("INSERT INTO receipts VALUES (?,?,NULL,?)").run(id, fingerprint, Date.now());
    const pending = Promise.resolve().then(execute).catch(error => [{ t: "request.error" as const, requestId: id, error: (error as Error).message }]).then(events => {
      this.#statement("UPDATE receipts SET response=? WHERE id=?").run(JSON.stringify(events), id);
      return events;
    }).finally(() => this.#pending.delete(id));
    this.#pending.set(id, pending);
    return pending;
  }

  close(): void {
    this.#statements.clear();
    this.#connection?.close();
    this.#connection = undefined;
  }
}

export const eventJournal = new EventJournal(join(dataRoot, "events.sqlite"));
