import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  open,
  realpath,
  rename,
  mkdir,
} from "node:fs/promises";
import { citropySkillsRoot, dataRoot } from "./paths.ts";
import { hasCode, ifMissing, unlessCode } from "../shared/expected-errors.mjs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { workspacePath } from "./workspaces.ts";
import { store } from "./store.ts";
import { providerControl } from "./providers/control.ts";
import { PROVIDER_IDS, type ProviderId, type Thread } from "../shared/protocol.ts";
import type { SkillInfo } from "../shared/features.ts";
import { claudeHome, codexHome } from "./providers/config-folders.ts";

export const MAX_SKILL_BYTES = 100_000;
const disabledName = "SKILL.md.citropy-disabled";
const inventories = new Map<
  string,
  { time: number; value: Promise<SkillInfo[]> }
>();

type SkillRoot = { path: string; provider: ProviderId; scope: SkillInfo["scope"] };

async function roots(projectPath?: string): Promise<SkillRoot[]> {
  const home = homedir();
  const locations: SkillRoot[] = [
    {
      path: join(codexHome(), "skills"),
      provider: "codex",
      scope: "personal",
    },
    {
      path: join(
        codexHome(),
        "plugins/cache",
      ),
      provider: "codex",
      scope: "plugin",
    },
    {
      path: join(
        claudeHome(),
        "skills",
      ),
      provider: "claude",
      scope: "personal",
    },
    {
      path: join(
        claudeHome(),
        "plugins/cache",
      ),
      provider: "claude",
      scope: "plugin",
    },
    {
      path: join(
        process.env.XDG_CONFIG_HOME || join(home, ".config"),
        "opencode/skills",
      ),
      provider: "opencode",
      scope: "personal",
    },
  ];
  for (const provider of PROVIDER_IDS) {
    locations.push({
      path: join(home, ".agents/skills"),
      provider,
      scope: "personal",
    });
    locations.push({ path: citropySkillsRoot, provider, scope: "citropy" });
    if (projectPath) {
      locations.push({
        path: join(projectPath, `.${provider}/skills`),
        provider,
        scope: "project",
      });
      locations.push({
        path: join(projectPath, ".agents/skills"),
        provider,
        scope: "project",
      });
    }
  }
  const registryFile = await readFile(
    join(
      claudeHome(),
      "plugins/installed_plugins.json",
    ),
    "utf8",
  ).catch(ifMissing(undefined));
  if (registryFile === undefined) return locations;
  const registry = JSON.parse(registryFile);
  const installed = Object.values(registry.plugins ?? {}).flat() as Array<{
    installPath?: string;
    projectPath?: string;
  }>;
  const filtered = locations.filter(
    (root) => root.provider !== "claude" || root.scope !== "plugin",
  );
  for (const plugin of installed)
    if (
      plugin.installPath &&
      (!plugin.projectPath || plugin.projectPath === projectPath)
    )
      filtered.push({
        path: plugin.installPath,
        provider: "claude",
        scope: "plugin",
      });
  return filtered;
}

async function codexSkills(
  projectPath?: string,
): Promise<SkillInfo[] | undefined> {
  const home = codexHome();
  if (!(await realpath(home).catch(ifMissing("")))) return;
  try {
    const result = await providerControl("codex", "skills/list", {
      cwds: [projectPath || homedir()],
      forceReload: true,
    });
    if (!Array.isArray(result.data)) return;
    return result.data.flatMap(
      (entry: {
        skills: Array<{
          name: string;
          description: string;
          path: string;
          enabled: boolean;
          scope: string;
          pluginId?: string;
        }>;
      }) =>
        entry.skills.map((skill) => ({
          id: createHash("sha256")
            .update(`codex:${skill.path}`)
            .digest("hex")
            .slice(0, 24),
          name: skill.name,
          description: skill.description.slice(0, 600),
          path: skill.path,
          enabled: skill.enabled,
          provider: "codex" as const,
          providerManaged: true,
          scope:
            skill.pluginId || skill.path.includes("/plugins/")
              ? ("plugin" as const)
              : skill.scope === "repo"
                ? ("project" as const)
                : ("personal" as const),
        })),
    );
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

export function skillInstructions(text: string): string {
  return text.replace(FRONTMATTER, "").trim();
}

export function frontmatterField(text: string, name: string): string {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
  const value = (new RegExp(`^${name}:\\s*(.+)$`, "m").exec(frontmatter)?.[1] ?? "").trim();
  return value.startsWith('"')
    ? value.replace(/^"|"$/g, "").replace(/\\(["\\])/g, "$1")
    : value.replace(/^'|'$/g, "");
}

export async function readSkillFile(path: string): Promise<string> {
  const file = await open(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_SKILL_BYTES);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, bytesRead);
  } finally {
    await file.close();
  }
}

export async function listSkills(
  projectId?: string,
  threadId?: string,
): Promise<SkillInfo[]> {
  const project = projectId ? store.projects.get(projectId) : undefined;
  if (projectId && !project) throw new Error("Workspace not found");
  const path = project ? workspacePath(project.id, threadId) : "";
  const cached = inventories.get(path);
  if (cached && Date.now() - cached.time < 5000) return cached.value;
  const value = scanSkills(path || undefined).catch((error) => {
    inventories.delete(path);
    throw error;
  });
  inventories.set(path, { time: Date.now(), value });
  if (inventories.size > 25)
    inventories.delete(inventories.keys().next().value!);
  return value;
}

export function mentionNames(text: string): Set<string> {
  return new Set([...text.matchAll(/(?:^|\s)[@$]([\w.:-]+)(?![\w./:-])/g)].map((match) => match[1]!));
}

export async function mentionedSkills(thread: Thread, text: string): Promise<SkillInfo[]> {
  const requested = mentionNames(text);
  if (!requested.size) return [];
  const matching = (await listSkills(thread.projectId, thread.id)).filter((skill) =>
    skill.enabled && skill.provider === thread.provider && requested.has(skill.name),
  );
  matching.sort((a, b) => Number(b.scope === "project") - Number(a.scope === "project"));
  const selected = new Map<string, SkillInfo>();
  for (const skill of matching) if (!selected.has(skill.name)) selected.set(skill.name, skill);
  return [...selected.values()];
}

async function scanRoot(root: SkillRoot, found: Set<string>): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  const queue = [{ path: root.path, depth: 0 }];
  const seen = new Set<string>();
  for (let index = 0; index < queue.length && index < 10_000; index++) {
    const entry = queue[index]!;
    const canonical = await realpath(entry.path).catch(unlessCode(["ENOENT", "ENOTDIR"], ""));
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    const entries = await readdir(entry.path, { withFileTypes: true }).catch(
      unlessCode(["ENOTDIR"], []),
    );
    const skill = entries.find(
      (file) => file.name === "SKILL.md" || file.name === disabledName,
    );
    if (skill) {
      const path = join(canonical, skill.name);
      const key = `${root.provider}:${join(canonical, "SKILL.md")}`;
      if (!found.has(key)) {
        found.add(key);
        const content = await readSkillFile(path).catch(ifMissing(""));
        skills.push({
          id: createHash("sha256").update(key).digest("hex").slice(0, 24),
          name: frontmatterField(content, "name") || basename(canonical),
          description: frontmatterField(content, "description").slice(0, 600),
          path,
          provider: root.provider,
          scope: root.scope,
          enabled: skill.name === "SKILL.md",
        });
      }
    }
    if (entry.depth < 9)
      for (const item of entries) {
        if (
          (item.isDirectory() || item.isSymbolicLink()) &&
          ![
            "node_modules",
            ".git",
            ".trash",
            "dist",
            "assets",
            "references",
            "scripts",
          ].includes(item.name)
        )
          queue.push({
            path: join(entry.path, item.name),
            depth: entry.depth + 1,
          });
      }
  }
  return skills;
}

export function citropySkills(provider: ProviderId): Promise<SkillInfo[]> {
  return scanRoot({ path: citropySkillsRoot, provider, scope: "citropy" }, new Set());
}

export function forgetSkillInventory(): void {
  inventories.clear();
}

async function scanSkills(projectPath?: string): Promise<SkillInfo[]> {
  const managed = await codexSkills(projectPath);
  const skills: SkillInfo[] = managed ?? [];
  const found = new Set<string>();
  for (const root of await roots(projectPath))
    if (!managed || root.provider !== "codex" || root.scope === "citropy")
      skills.push(...await scanRoot(root, found));
  return skills.sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider),
  );
}

export async function changeSkill(
  projectId: string | undefined,
  id: string,
  action: "enable" | "disable" | "delete",
): Promise<Set<ProviderId>> {
  inventories.clear();
  const skills = await listSkills(projectId);
  const skill = skills.find((entry) => entry.id === id);
  if (!skill)
    throw new Error("This skill is no longer installed. Refresh the list.");
  const affected = new Set(
    skills
      .filter((entry) => dirname(entry.path) === dirname(skill.path))
      .map((entry) => entry.provider),
  );
  if (
    [...store.threads.values()].some(
      (thread) => thread.running && affected.has(thread.provider),
    )
  )
    throw new Error(
      "Wait for this provider's conversations to finish before changing its skills.",
    );
  if (action === "delete") {
    const trash = join(
      dataRoot,
      "deleted-skills",
      `${Date.now()}-${id}`,
    );
    await mkdir(trash, { recursive: true, mode: 0o700 });
    await rename(skill.path, join(trash, basename(skill.path)));
  } else if (action === "enable" || action === "disable") {
    if (skill.enabled === (action === "enable")) return affected;
    if (skill.providerManaged)
      await providerControl("codex", "skills/config/write", {
        path: skill.path,
        enabled: action === "enable",
      });
    else
      await rename(
        skill.path,
        join(
          dirname(skill.path),
          action === "enable" ? "SKILL.md" : disabledName,
        ),
      );
  } else throw new Error("Unknown skill action");
  inventories.clear();
  return affected;
}

export async function readSkill(
  projectId: string | undefined,
  id: string,
): Promise<string> {
  const skill = (await listSkills(projectId)).find((entry) => entry.id === id);
  if (!skill) throw new Error("Skill not found");
  return skillInstructions(await readSkillFile(skill.path));
}
