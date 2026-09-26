const applied = new WeakMap<Element, string | string[]>();

function markupOf(node: Node): string {
  return node instanceof Element ? node.outerHTML : `${node.nodeType}:${node.textContent ?? ""}`;
}

function parse(html: string): Node[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  return [...template.content.childNodes];
}

export function patchHtml(root: Element, html: string): void {
  const stored = applied.get(root);
  if (stored === html) return;
  if (stored === undefined) {
    root.innerHTML = html;
    applied.set(root, html);
    return;
  }
  const previous = typeof stored === "string" ? parse(stored).map(markupOf) : stored;
  const incoming = parse(html);
  const markup = incoming.map(markupOf);
  let keep = 0;
  while (keep < markup.length && keep < previous.length && keep < root.childNodes.length && markup[keep] === previous[keep]) keep++;
  while (root.childNodes.length > keep) root.lastChild!.remove();
  for (let index = keep; index < incoming.length; index++) root.appendChild(incoming[index]!);
  applied.set(root, markup);
}
