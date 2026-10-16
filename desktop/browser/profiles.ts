import { readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Session, session as electronSession } from "electron";
import { ifMissing } from "../../shared/expected-errors.mjs";
import { saveJson } from "../../shared/save-json.ts";
import { importCookies, listCookieSources } from "./cookie-import.ts";

const WORKSPACE_PROFILE = "workspace";
const MAX_PROFILES = 20;
const MAX_NAME_LENGTH = 60;

interface ProjectSettings {
  selected: string;
  profiles: Array<{ id: string; name: string }>;
}

// Comes from the renderer, so lookups below reject anything that is not a known id.
export interface ProfileInput {
  projectId: string;
  profileId?: string;
  method?: string;
  selected?: string;
  name?: unknown;
  id?: string;
  kind?: string;
  sourceId?: string;
}

export type Sessions = Pick<typeof electronSession, "fromPartition">;

// The workspace and profile an open browser tab uses.
export interface OpenTab {
  projectId?: string;
  profileId?: string;
}

// Each bot browses in its own profile, so one bot's sign-ins never reach another.
export function botProfile(profileId: unknown) {
  if (typeof profileId !== "string" || !/^bot-[a-zA-Z0-9_-]+$/.test(profileId)) return undefined;
  return { id: profileId, name: "Bot", partition: `persist:citropy-${profileId}` };
}

export async function clearProfileData(target: Session) {
  await target.clearStorageData();
  await target.clearCache();
  await target.clearCodeCaches({});
}

// Each workspace has browser profiles with their own cookies and storage. One of them is
// selected, and new tabs in the workspace open in it.
export class BrowserProfiles {
  readonly #file: string;
  readonly #sessions: Sessions;
  readonly #settings: Record<string, ProjectSettings>;
  #operations = Promise.resolve();

  static async load(userData: string, sessions: Sessions) {
    await mkdir(userData, { recursive: true });
    const file = join(userData, "browser-profiles.json");
    const settings = JSON.parse(await readFile(file, "utf8").catch(ifMissing("{}")));
    return new BrowserProfiles(file, sessions, settings);
  }

  constructor(file: string, sessions: Sessions, settings: Record<string, ProjectSettings>) {
    this.#file = file;
    this.#sessions = sessions;
    this.#settings = settings;
  }

  // The profile a tab opens in: the one asked for, or the workspace's selected profile.
  forTab(projectId: string, profileId?: string) {
    const settings = this.#project(projectId);
    const id = profileId ?? settings.selected;
    const profile = settings.profiles.find((entry) => entry.id === id);
    if (!profile) throw new Error("Browser profile not found");
    const partition =
      profile.id === WORKSPACE_PROFILE
        ? `persist:citropy-${projectId}`
        : `persist:citropy-${projectId}-${profile.id}`;
    return { ...profile, partition };
  }

  // Runs one operation at a time, so overlapping requests cannot undo each other's saves.
  handle(operation: string, input: ProfileInput, openTabs: OpenTab[]) {
    const result = this.#operations.then(() => this.#apply(operation, input, openTabs));
    this.#operations = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  async #apply(operation: string, input: ProfileInput, openTabs: OpenTab[]) {
    switch (operation) {
      case "forget-bot":
        return this.#forgetBot(input.profileId);
      case "forget":
        return this.#forget(input.projectId);
      case "sources":
        return listCookieSources();
      case "profiles":
        return this.#profiles(input, openTabs);
      case "clear":
        return this.#clear(input);
      case "import":
        return importCookies(this.#sessionOf(input.projectId, input.profileId), input.sourceId);
      default:
        throw new Error("Unknown browser profile action");
    }
  }

  async #profiles(input: ProfileInput, openTabs: OpenTab[]) {
    const { projectId } = input;
    if (input.method === "POST" && input.selected) this.#select(projectId, input.selected);
    else if (input.method === "POST") this.#create(projectId, input.name);
    else if (input.method === "DELETE") await this.#delete(projectId, input.id, openTabs);
    return this.#list(projectId, openTabs);
  }

  #select(projectId: string, profileId: string) {
    this.forTab(projectId, profileId);
    this.#project(projectId).selected = profileId;
    this.#save();
  }

  #create(projectId: string, rawName: unknown) {
    const settings = this.#project(projectId);
    const name = String(rawName || "")
      .trim()
      .slice(0, MAX_NAME_LENGTH);
    if (!name) throw new Error("Enter a profile name.");
    if (settings.profiles.length >= MAX_PROFILES)
      throw new Error(`Keep up to ${MAX_PROFILES} profiles per workspace.`);
    const id = randomUUID();
    settings.profiles.push({ id, name });
    settings.selected = id;
    this.#save();
  }

  async #delete(projectId: string, profileId: string | undefined, openTabs: OpenTab[]) {
    if (profileId === WORKSPACE_PROFILE)
      throw new Error("The workspace profile cannot be deleted.");
    this.forTab(projectId, profileId);
    if (openTabs.some((tab) => tab.projectId === projectId && tab.profileId === profileId))
      throw new Error("Close this profile's browser tabs first.");
    await clearProfileData(this.#sessionOf(projectId, profileId));
    const settings = this.#project(projectId);
    settings.profiles = settings.profiles.filter((entry) => entry.id !== profileId);
    if (settings.selected === profileId) settings.selected = WORKSPACE_PROFILE;
    this.#save();
  }

  async #list(projectId: string, openTabs: OpenTab[]) {
    const settings = this.#project(projectId);
    const profiles = settings.profiles.map(async (profile) => ({
      ...profile,
      projectId,
      cookies: (await this.#sessionOf(projectId, profile.id).cookies.get({})).length,
      activeTabs: openTabs.filter(
        (tab) => tab.projectId === projectId && (tab.profileId || WORKSPACE_PROFILE) === profile.id,
      ).length,
    }));
    return { selected: settings.selected, profiles: await Promise.all(profiles) };
  }

  async #clear(input: ProfileInput) {
    const target = this.#sessionOf(input.projectId, input.profileId);
    if (input.kind === "cookies") await target.clearStorageData({ storages: ["cookies"] });
    else if (input.kind === "cache") await target.clearCache();
    else throw new Error("Select cookies or cache.");
    return { ok: true };
  }

  async #forget(projectId: string) {
    const settings = this.#project(projectId);
    for (const profile of settings.profiles)
      await clearProfileData(this.#sessionOf(projectId, profile.id));
    delete this.#settings[projectId];
    this.#save();
    return { ok: true };
  }

  async #forgetBot(profileId: unknown) {
    const profile = botProfile(profileId);
    if (!profile) throw new Error("Bot profile not found");
    await clearProfileData(this.#sessions.fromPartition(profile.partition));
    return { ok: true };
  }

  // An empty profile id means the workspace's selected profile.
  #sessionOf(projectId: string, profileId?: string) {
    return this.#sessions.fromPartition(this.forTab(projectId, profileId || undefined).partition);
  }

  #project(projectId: unknown) {
    if (typeof projectId !== "string" || !/^[a-zA-Z0-9_-]+$/.test(projectId))
      throw new Error("Invalid workspace");
    this.#settings[projectId] ??= {
      selected: WORKSPACE_PROFILE,
      profiles: [{ id: WORKSPACE_PROFILE, name: "Workspace" }],
    };
    return this.#settings[projectId];
  }

  #save() {
    saveJson(this.#file, this.#settings);
  }
}
