import type { BrowserAction } from "../../shared/workbench.ts";
import { centre, elementBox, nodeParams, objectIdOf } from "./dom.ts";
import { findNode } from "./locator.ts";
import { chooseOption } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";
import type { DomNode } from "./types.ts";

type SelectAction = Extract<BrowserAction, { action: "select" }>;
type UploadAction = Extract<BrowserAction, { action: "upload" }>;

// Shows the pointer pressing the element. The change itself goes through CDP.
async function showPress(tab: BrowserTab, node: DomNode) {
  const box = await elementBox(tab, node);
  const middle = centre(box);
  await tab.pointer.moveTo(middle.x, middle.y);
  await tab.pointer.press(box);
  await tab.pointer.release();
}

export async function selectOption(tab: BrowserTab, input: SelectAction) {
  if (typeof input.option !== "string" || !input.option)
    throw new Error("Provide the option value or visible text to select");
  const node = await findNode(tab, input);
  if (!node) throw new Error("Choose the dropdown by ref or selector");
  await showPress(tab, node);
  const { result, exceptionDetails } = await tab.cdp(
    "Runtime.callFunctionOn",
    {
      objectId: await objectIdOf(tab, node),
      arguments: [{ value: input.option }],
      returnByValue: true,
      functionDeclaration: String(chooseOption),
    },
    node.session,
  );
  if (exceptionDetails) {
    const description: string | undefined = exceptionDetails.exception?.description;
    const firstLine = description?.split("\n")[0]!.replace(/^Error: /, "");
    throw new Error(firstLine ?? "Could not select that option");
  }
  return `Selected ${result.value}`;
}

export async function uploadFiles(tab: BrowserTab, input: UploadAction) {
  const { paths } = input;
  if (!Array.isArray(paths) || !paths.length || paths.some((path) => typeof path !== "string"))
    throw new Error("Provide the files to upload");
  const node = await findNode(tab, input);
  if (!node) throw new Error("Choose the file input by ref or selector");
  await showPress(tab, node);
  await tab.cdp("DOM.setFileInputFiles", { files: paths, ...nodeParams(node) }, node.session);
  return `Selected ${paths.length} file${paths.length === 1 ? "" : "s"}`;
}
