import type { BrowserAction } from "../../shared/workbench.ts";
import { hasText, isVisible, pageCall } from "./page-scripts.ts";
import type { BrowserTab } from "./tab.ts";

const DEFAULT_WAIT_MS = 5000;
const MAX_WAIT_MS = 30_000;
const POLL_MS = 100;
const MAX_EXPRESSION_LENGTH = 20_000;
const EVALUATE_TIMEOUT_MS = 10_000;
const MAX_RESULT_LENGTH = 20_000;

type WaitAction = Extract<BrowserAction, { action: "wait" }>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits for a visible element or for text on the page. With neither, just waits.
export async function waitFor(tab: BrowserTab, input: WaitAction) {
  const timeout = input.timeout ?? DEFAULT_WAIT_MS;
  if (!Number.isFinite(timeout) || timeout < 0 || timeout > MAX_WAIT_MS)
    throw new Error(`Use a wait timeout from 0 to ${MAX_WAIT_MS} milliseconds`);
  if (input.selector === undefined && input.text === undefined) {
    await sleep(timeout);
    return `Waited ${timeout} ms`;
  }
  const expression =
    input.selector !== undefined
      ? pageCall(isVisible, String(input.selector))
      : pageCall(hasText, String(input.text));
  const target =
    input.selector !== undefined ? `selector ${input.selector}` : `text "${input.text}"`;
  const started = Date.now();
  for (;;) {
    const { result, exceptionDetails } = await tab.cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? "Invalid selector");
    if (result.value === true) return `Found after ${Date.now() - started} ms`;
    if (Date.now() - started >= timeout)
      throw new Error(`Timed out after ${timeout} ms waiting for ${target}`);
    await sleep(POLL_MS);
  }
}

// Runs an agent's JavaScript in the page and returns the result as JSON.
export async function evaluate(tab: BrowserTab, expression: unknown) {
  if (
    typeof expression !== "string" ||
    !expression.trim() ||
    expression.length > MAX_EXPRESSION_LENGTH
  )
    throw new Error("Provide a JavaScript expression to evaluate");
  const { result, exceptionDetails } = await tab.cdp("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: EVALUATE_TIMEOUT_MS,
    userGesture: false,
  });
  if (exceptionDetails)
    throw new Error(
      exceptionDetails.exception?.description ?? exceptionDetails.text ?? "The expression failed",
    );
  const value = JSON.stringify(result.value ?? null);
  if (value.length <= MAX_RESULT_LENGTH) return value;
  return `${value.slice(0, MAX_RESULT_LENGTH)}… (truncated)`;
}
