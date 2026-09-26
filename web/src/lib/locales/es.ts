import { editorEs } from "./editor.es.ts";
import { automationEs } from "./automation.es.ts";
import { environmentsEs } from "./environments.es.ts";
import { coreEs } from "./core.es.ts";
import { settingsEs } from "./settings.es.ts";
import { chatEs } from "./chat.es.ts";
import { gitEs } from "./git.es.ts";
import { systemEs } from "./system.es.ts";

export const spanish: Record<string, string> = {
  ...coreEs,
  ...editorEs,
  ...automationEs,
  ...environmentsEs,
  ...settingsEs,
  ...chatEs,
  ...gitEs,
  ...systemEs,
};
