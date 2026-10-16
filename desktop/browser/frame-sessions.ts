export interface FrameSession {
  sessionId: string;
  targetId: string;
}

// Out-of-process iframes get their own CDP session. Each one gets a short key, such as
// "f3", that prefixes the refs of its elements in snapshots.
export class FrameSessions {
  readonly #byKey = new Map<string, FrameSession>();
  // Never reset, so a ref from an earlier page cannot point into a newer frame.
  #count = 0;

  add(frame: FrameSession) {
    const key = `f${++this.#count}`;
    this.#byKey.set(key, frame);
    return key;
  }

  remove(sessionId: string) {
    for (const [key, frame] of this.#byKey)
      if (frame.sessionId === sessionId) this.#byKey.delete(key);
  }

  clear() {
    this.#byKey.clear();
  }

  get(key: string) {
    return this.#byKey.get(key);
  }

  keyOfSession(sessionId: string) {
    for (const [key, frame] of this.#byKey) if (frame.sessionId === sessionId) return key;
    return undefined;
  }

  findByTarget(targetId: string) {
    for (const [key, frame] of this.#byKey)
      if (frame.targetId === targetId) return { key, sessionId: frame.sessionId };
    return undefined;
  }
}
