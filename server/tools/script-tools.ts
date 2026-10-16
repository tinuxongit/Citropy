import { uid } from "../ids.ts";
import { required } from "../mcp/mcp-workspace.ts";
import { validScripts } from "../routes/projects.ts";
import { store } from "../store.ts";
import type { Thread } from "../../shared/protocol.ts";

const CHANGES = new Set(["script_save", "script_remove"]);

export function callScriptTool(
  thread: Thread,
  name: string,
  args: Record<string, unknown>,
): unknown {
  if (CHANGES.has(name) && thread.permissionMode === "plan")
    throw new Error("This action is unavailable in Plan only mode.");
  const scripts = store.projects.get(thread.projectId)?.scripts ?? [];
  switch (name) {
    case "script_list":
      return scripts;
    case "script_save": {
      const script = {
        id: args.id === undefined ? uid("scr") : required(args, "id"),
        name: required(args, "name"),
        command: required(args, "command"),
      };
      if (args.id !== undefined && !scripts.some((entry) => entry.id === script.id))
        throw new Error(`No project script ${script.id}. Check script_list.`);
      const next = scripts.some((entry) => entry.id === script.id)
        ? scripts.map((entry) => (entry.id === script.id ? script : entry))
        : [...scripts, script];
      const saved = store.updateProject(thread.projectId, { scripts: validScripts(next) }).scripts!;
      return saved.find((entry) => entry.id === script.id);
    }
    case "script_remove": {
      const id = required(args, "id");
      if (!scripts.some((entry) => entry.id === id))
        throw new Error(`No project script ${id}. Check script_list.`);
      store.updateProject(thread.projectId, {
        scripts: scripts.filter((entry) => entry.id !== id),
      });
      return "Project script deleted.";
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
