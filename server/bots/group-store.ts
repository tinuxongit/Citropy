import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bus } from "../bus.ts";
import { dataRoot } from "../paths.ts";
import { saveJson } from "../../shared/save-json.ts";
import { store } from "../store.ts";
import { botStore } from "./bot-store.ts";
import { addNotice, flag, text } from "../fields.ts";
import { BOT_LIMITS, previewText } from "../../shared/bots.ts";
import type { Bot, BotGroup, BotGroupPatch } from "../../shared/bots.ts";
import type { Message } from "../../shared/protocol.ts";

const groupsFile = join(dataRoot, "bot-groups.json");

function loadGroups(): BotGroup[] {
  if (!existsSync(groupsFile)) return [];
  return (JSON.parse(readFileSync(groupsFile, "utf8")) as Omit<BotGroup, "working">[]).map(
    (group) => ({ ...group, working: [] }),
  );
}

function checkMembers(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((id) => typeof id !== "string"))
    throw new Error("Choose the bots for this group.");
  const ids = [...new Set(value as string[])];
  if (ids.length < BOT_LIMITS.groupMembersMin || ids.length > BOT_LIMITS.groupMembersMax)
    throw new Error(
      `A group holds ${BOT_LIMITS.groupMembersMin} to ${BOT_LIMITS.groupMembersMax} bots.`,
    );
  for (const id of ids) botStore.get(id);
  return ids;
}

function joinedNames(bots: Bot[]): string {
  return bots
    .map((bot) => bot.name)
    .join(", ")
    .slice(0, BOT_LIMITS.groupNameLength);
}

function previewLine(message: Message): string | undefined {
  const body = message.parts.findLast((part) => part.kind === "text" && part.text.trim());
  if (message.role === "system" || body?.kind !== "text") return undefined;
  const author = message.origin?.kind === "bot" ? message.origin.name : "You";
  return previewText(`${author}: ${body.text}`);
}

class GroupStore {
  groups = new Map(loadGroups().map((group) => [group.id, group]));

  constructor() {
    bus.subscribe((event) => {
      if (event.t === "thread.remove") {
        const group = this.byThread(event.id);
        if (group) this.#forget(group.id);
      }
      if (event.t === "bot.remove") {
        for (const group of this.list().filter((entry) => entry.botIds.includes(event.id))) {
          group.botIds = group.botIds.filter((id) => id !== event.id);
          group.working = group.working.filter((id) => id !== event.id);
          this.#changed(group);
        }
      }
      if (event.t === "message.add") {
        const group = this.byThread(event.threadId);
        const preview = group && previewLine(event.message);
        if (group && preview) {
          group.preview = preview;
          if (event.message.origin?.kind === "bot") group.unread = true;
          this.#changed(group);
        }
      }
    });
  }

  list(): BotGroup[] {
    return [...this.groups.values()];
  }

  get(id: string): BotGroup {
    const group = this.groups.get(id);
    if (!group) throw new Error("This group no longer exists.");
    return group;
  }

  byThread(threadId: string): BotGroup | undefined {
    return this.list().find((group) => group.threadId === threadId);
  }

  members(group: BotGroup): Bot[] {
    return group.botIds.map((id) => botStore.get(id));
  }

  assertRoom(botIds: unknown): string[] {
    if (this.groups.size >= BOT_LIMITS.groups)
      throw new Error(`You can keep up to ${BOT_LIMITS.groups} groups. Delete one to make room.`);
    return checkMembers(botIds);
  }

  create(id: string, threadId: string, botIds: string[]): BotGroup {
    const members = this.assertRoom(botIds);
    const group: BotGroup = {
      id,
      name: joinedNames(members.map((member) => botStore.get(member))),
      botIds: members,
      threadId,
      pinned: false,
      hidden: false,
      createdAt: Date.now(),
      working: [],
    };
    this.groups.set(id, group);
    store.patchThread(threadId, { title: group.name });
    this.#changed(group);
    return group;
  }

  update(id: string, patch: BotGroupPatch): BotGroup {
    const group = this.get(id);
    for (const [key, value] of Object.entries(patch)) {
      switch (key) {
        case "name": {
          const name = text(value, "Name", BOT_LIMITS.groupNameLength, false);
          if (name === group.name) break;
          group.name = name;
          store.patchThread(group.threadId, { title: name });
          addNotice(group.threadId, `Renamed to ${name}`);
          break;
        }
        case "botIds": {
          const next = checkMembers(value);
          for (const added of next.filter((entry) => !group.botIds.includes(entry)))
            addNotice(group.threadId, `Added ${botStore.get(added).name}`);
          for (const removed of group.botIds.filter((entry) => !next.includes(entry)))
            addNotice(group.threadId, `Removed ${botStore.get(removed).name}`);
          group.botIds = next;
          group.working = group.working.filter((entry) => next.includes(entry));
          break;
        }
        case "pinned":
          group.pinned = flag(value, "Pinned");
          break;
        case "hidden":
          group.hidden = flag(value, "Hidden");
          break;
        case "unread":
          group.unread = flag(value, "Unread");
          break;
        default:
          throw new Error(`Groups have no ${key} setting.`);
      }
    }
    this.#changed(group);
    return group;
  }

  setWorking(id: string, botId: string, working: boolean): void {
    const group = this.groups.get(id);
    if (!group || group.working.includes(botId) === working) return;
    group.working = working
      ? [...group.working, botId]
      : group.working.filter((entry) => entry !== botId);
    bus.emit({ t: "group.upsert", group });
  }

  #forget(id: string): void {
    if (!this.groups.delete(id)) return;
    this.#save();
    bus.emit({ t: "group.remove", id });
  }

  #changed(group: BotGroup): void {
    this.#save();
    bus.emit({ t: "group.upsert", group });
  }

  #save(): void {
    saveJson(
      groupsFile,
      this.list().map(({ working: _working, ...group }) => group),
    );
  }
}

export const groupStore = new GroupStore();
