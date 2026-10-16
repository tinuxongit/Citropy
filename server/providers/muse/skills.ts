import type {
  SkillCatalogEntry,
  SkillListResult,
  TurnInputPart,
} from "@muse-code/sdk/dist/src/msp.js";
import type { ProviderCommand } from "../../../shared/features.ts";
import type { ProviderLaunch } from "../types.ts";
import { MUSE_PROVIDER, MuseHost } from "./host.ts";

const SKILL_INVOCATION = /^\/([\w.:-]+)(?:\s+([\s\S]*))?$/;

export function skillCommand(skill: SkillCatalogEntry): ProviderCommand {
  return {
    name: skill.selector,
    description: skill.description || skill.displayName,
    ...(skill.argumentHint ? { argumentHint: skill.argumentHint } : {}),
  };
}

export function skillPart(text: string, selectors: ReadonlySet<string>): TurnInputPart | undefined {
  const match = SKILL_INVOCATION.exec(text.trim());
  if (!match || !selectors.has(match[1]!)) return undefined;
  const args = match[2]?.trim();
  return { type: "skill", selector: match[1]!, ...(args ? { arguments: args } : {}) };
}

export async function listSkills(host: MuseHost, sessionId: string): Promise<SkillCatalogEntry[]> {
  return (await host.request<SkillListResult>("skill/list", { sessionId })).skills;
}

export async function listMuseCommands(
  cwd: string,
  launch: ProviderLaunch = {},
): Promise<ProviderCommand[]> {
  const host = await MuseHost.start({ launch, cwd, access: "readOnly", sessionLog: false });
  try {
    const sessionId = host.connection.mintCommandId();
    await host.command("session/start", {
      sessionId,
      workspaceRoot: cwd,
      providerId: MUSE_PROVIDER,
      approvalMode: "denyUnmatched",
    });
    return (await listSkills(host, sessionId)).map(skillCommand);
  } finally {
    await host.close();
  }
}
