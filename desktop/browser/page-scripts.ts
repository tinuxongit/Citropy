// These functions run inside a web page, not in Electron. They are sent as source text
// with String(fn), so they must not use imports or anything else from this module.

export function querySingle(selector: string) {
  const nodes = document.querySelectorAll(selector);
  if (nodes.length !== 1) throw new Error("The selector must match exactly one element");
  return nodes[0];
}

export function isVisible(selector: string) {
  const node = document.querySelector(selector);
  if (!node) return false;
  const box = node.getBoundingClientRect();
  return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== "hidden";
}

export function hasText(text: string) {
  return Boolean(document.body && document.body.innerText.includes(text));
}

export function hasOpenTopLayer() {
  return Boolean(document.querySelector("dialog:modal, :popover-open"));
}

export function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

// Waits until an image has loaded and painted, or gives up after the timeout.
export function imagePainted(selector: string, timeout: number) {
  return new Promise((resolve) => {
    const started = performance.now();
    const check = () => {
      const image = document.querySelector<HTMLImageElement>(selector);
      const loaded = image?.complete && image.naturalWidth;
      if (loaded || performance.now() - started > timeout)
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      else requestAnimationFrame(check);
    };
    check();
  });
}

// Runs with `this` set to an input or editable element, so typing replaces its contents.
export function selectContents(this: Element) {
  if ("select" in this && typeof this.select === "function") {
    this.select();
    return;
  }
  if (!(this instanceof HTMLElement) || !this.isContentEditable) return;
  const range = document.createRange();
  range.selectNodeContents(this);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

// Runs with `this` set to a <select>. Picks the option by value, then by visible text.
export function chooseOption(this: Element, choice: string) {
  if (!(this instanceof HTMLSelectElement)) throw new Error("That element is not a dropdown");
  const options = [...this.options];
  const option =
    options.find((entry) => entry.value === choice) ??
    options.find((entry) => entry.text.trim() === choice.trim());
  if (!option) {
    const names = options.map((entry) => entry.text.trim()).join(", ");
    throw new Error(`No option matches ${choice}. Options: ${names}`);
  }
  this.value = option.value;
  this.dispatchEvent(new Event("input", { bubbles: true }));
  this.dispatchEvent(new Event("change", { bubbles: true }));
  return option.text.trim();
}

// Builds an expression that calls one of the functions above with JSON arguments.
export function pageCall<Args extends unknown[]>(fn: (...args: Args) => unknown, ...args: Args) {
  const values = args.map((value) => JSON.stringify(value)).join(", ");
  return `(${String(fn)})(${values})`;
}
