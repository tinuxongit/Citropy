import { remoteId } from "./remote.ts";
import { store } from "./store.ts";
import { mentionNames } from "./skills.ts";
import { desktopConnected } from "./desktop.ts";
import { listConnections } from "./connections.ts";
import { withInstructions } from "./providers/skill-prompt.ts";
import { resolveProjectSettings } from "../shared/project-settings.ts";
import { connectionMention } from "../shared/connection-sites.mjs";
import type { Connection, ToolMention } from "../shared/features.ts";

type Settings = ReturnType<typeof resolveProjectSettings>;
type Mention = ToolMention & { instruction: string };

const browserAvailable = (settings: Settings) => !remoteId && settings.browserAccess !== false;

const TOOLS: Array<Omit<Mention, "section"> & { available: (settings: Settings) => boolean }> = [
  {
    name: "browser",
    title: "Browser",
    description: "Use Citropy's shared browser and your signed-in sites",
    instruction: 'Use Citropy\'s shared browser for this request so the user sees the same pages. Load tool_help with {"category":"browser"}, then call run_tool with the returned names.',
    available: browserAvailable,
  },
  {
    name: "terminal",
    title: "Terminal",
    description: "Run commands in a terminal you can watch",
    instruction: 'Run the commands for this request in a Citropy terminal the user can watch. Load tool_help with {"category":"terminal"}, then call run_tool with the returned names.',
    available: () => true,
  },
  {
    name: "subagents",
    title: "Subagents",
    description: "Hand parts of the work to agents on any provider",
    instruction: 'Use Citropy subagents for this request. Load tool_help with {"category":"subagent"}, call run_tool with {"name":"subagent_providers","arguments":{}} to see available accounts and models, then start them with subagent_start.',
    available: () => true,
  },
  {
    name: "visual",
    title: "Visual",
    description: "Answer with an interactive chart, table, diagram or mockup",
    instruction: 'Answer this request with an interactive visual. Load tool_help with {"category":"workspace"}, call run_tool with {"name":"workspace_visual","arguments":{"title":"...","html":"..."}}, and put the returned markdown above the written answer. To change an earlier visual, pass its id as from with edits instead of rewriting it.',
    available: (settings) => Boolean(settings.visualReplies),
  },
  {
    name: "image",
    title: "Image",
    description: "Show screenshots and images in the reply",
    instruction: 'Show the relevant screenshots or images in your reply. Load tool_help with {"category":"workspace"}, call run_tool with {"name":"workspace_image","arguments":{"path":"/absolute/path/to/image.png"}}, and use the returned markdown verbatim.',
    available: () => true,
  },
];

function connectionInstruction(connection: Connection): string {
  const open = `Load tool_help with {"category":"browser"}, then call run_tool with {"name":"browser_open","arguments":{"url":${JSON.stringify(connection.url)}}}`;
  return connection.signedIn
    ? `Use the user's ${connection.name} account for this request. ${open}. Pages on ${connection.site} open with their sign-in.`
    : `Use the user's ${connection.name} account for this request. They have not finished signing in to ${connection.site}. ${open}, then use ask_user to have them sign in on that page and choose Finish sign-in before you continue.`;
}

function connectionMentions(connections: Connection[]): Mention[] {
  return connections.map((connection) => ({
    name: connectionMention(connection),
    title: connection.name,
    description: connection.signedIn ? connection.site : `${connection.site}, not signed in yet`,
    section: "Connections",
    url: connection.url,
    instruction: connectionInstruction(connection),
  }));
}

async function availableMentions(): Promise<Mention[]> {
  const settings = resolveProjectSettings(store.projectDefaults);
  const tools = TOOLS.filter((tool) => tool.available(settings)).map(({ available, ...tool }): Mention => ({ ...tool, section: "Citropy" }));
  const connections = browserAvailable(settings) && desktopConnected() ? await listConnections() : [];
  return [...tools, ...connectionMentions(connections)].filter((mention, index, all) => all.findIndex((other) => other.name === mention.name) === index);
}

export async function listToolMentions(): Promise<ToolMention[]> {
  return (await availableMentions()).map(({ instruction, ...mention }) => mention);
}

export async function mentionedTools(text: string, skills: Array<{ name: string }>): Promise<Mention[]> {
  const requested = mentionNames(text);
  for (const skill of skills) requested.delete(skill.name);
  if (!requested.size) return [];
  return (await availableMentions()).filter((mention) => requested.has(mention.name));
}

export function withToolMentions(prompt: string, tools: Array<{ instruction: string }>): string {
  if (!tools.length) return prompt;
  return withInstructions(prompt, tools.map((tool) => tool.instruction).join("\n"));
}
