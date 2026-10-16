import { rosterItem } from "./roster.ts";
import { selectRosterEntry, useApp } from "./store.ts";

const HISTORY_LIMIT = 50;

const back: string[] = [];
const forward: string[] = [];
let travelling = false;

useApp.subscribe((state, previous) => {
  if (travelling || !previous.activeRosterId || state.activeRosterId === previous.activeRosterId)
    return;
  back.push(previous.activeRosterId);
  if (back.length > HISTORY_LIMIT) back.shift();
  forward.length = 0;
});

function travel(from: string[], to: string[]): void {
  const state = useApp.getState();
  let id = from.pop();
  while (id && !rosterItem(state, id)) id = from.pop();
  if (!id) return;
  if (state.activeRosterId) to.push(state.activeRosterId);
  travelling = true;
  selectRosterEntry(id);
  travelling = false;
}

export function visitPreviousEntry(): void {
  travel(back, forward);
}

export function visitNextEntry(): void {
  travel(forward, back);
}
