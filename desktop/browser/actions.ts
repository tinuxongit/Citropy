import type { BrowserAction, BrowserState } from "../../shared/workbench.ts";
import { emulateMedia, resize } from "./emulation.ts";
import { selectOption, uploadFiles } from "./forms.ts";
import { click, hover, pressKey, scroll, typeText } from "./input.ts";
import { goBack, goForward, load, reload, settle, webAddress } from "./navigation.ts";
import { evaluate, waitFor } from "./page.ts";
import { swipe } from "./swipe.ts";
import type { BrowserTab } from "./tab.ts";

type ActionName = BrowserAction["action"];
type ActionOf<Name extends ActionName> = BrowserAction & { action: Name };
// A handler returns the text the agent sees as the action's result, if it has one.
type Handler<Name extends ActionName> = (
  tab: BrowserTab,
  input: ActionOf<Name>,
) => Promise<string | undefined | void>;

const handlers: { [Name in ActionName]: Handler<Name> } = {
  navigate: (tab, input) => load(tab.page(), webAddress(input.url)),
  back: goBack,
  forward: goForward,
  reload,
  stop: async (tab) => tab.page().stop(),
  snapshot: async () => {},
  click: async (tab, input) => {
    await click(tab, input);
  },
  hover,
  type: typeText,
  press: (tab, input) => pressKey(tab, input.key),
  scroll,
  swipe,
  select: selectOption,
  upload: uploadFiles,
  wait: waitFor,
  evaluate: (tab, input) => evaluate(tab, input.expression),
  emulate: emulateMedia,
  resize,
  dialog: (tab, input) =>
    tab.cdp("Page.handleJavaScriptDialog", {
      accept: Boolean(input.accept),
      promptText: input.text ?? "",
    }),
};

// Pointer and keyboard actions, which need the local window and a settled viewport.
const inputActions = new Set<ActionName>(["click", "type", "press", "scroll", "swipe", "hover"]);
// Actions that can start a navigation, so their result waits for the page to load.
const settlingActions = new Set<ActionName>([
  "click",
  "type",
  "press",
  "swipe",
  "upload",
  "scroll",
  "select",
]);

// A page dialog such as alert() blocks the page, so an action that opens one would never
// finish. Returns as soon as a dialog opens, so the agent can answer it.
export async function runAction(tab: BrowserTab, input: BrowserAction) {
  if (input.action === "dialog") return perform(tab, input);
  const debuggerApi = tab.page().debugger;
  let onMessage!: (event: unknown, method: string) => void;
  const dialogOpened = new Promise<BrowserState>((resolve) => {
    onMessage = (_, method) => {
      if (method === "Page.javascriptDialogOpening") resolve(tab.currentState());
    };
    debuggerApi.on("message", onMessage);
  });
  try {
    return await Promise.race([perform(tab, input), dialogOpened]);
  } finally {
    debuggerApi.off("message", onMessage);
  }
}

async function perform(tab: BrowserTab, input: BrowserAction) {
  tab.state.error = undefined;
  if (tab.state.dialog && input.action !== "dialog")
    throw new Error(`Respond to the browser dialog first: ${tab.state.dialog.message}`);
  if (!Object.hasOwn(handlers, input.action)) throw new Error("Unknown browser action");
  if (inputActions.has(input.action)) await tab.prepareForInput();
  const since = Date.now();
  // TypeScript cannot tie the handler's input type to this input's action, so widen it.
  const handler = handlers[input.action] as Handler<ActionName>;
  const result = await handler(tab, input);
  if (settlingActions.has(input.action)) await settle(tab);
  await tab.pointer.release();
  tab.publish();
  const events = tab.logs.filter((entry) => entry.time >= since);
  return {
    ...tab.currentState(),
    ...(typeof result === "string" ? { result } : {}),
    ...(events.length ? { events } : {}),
  };
}
