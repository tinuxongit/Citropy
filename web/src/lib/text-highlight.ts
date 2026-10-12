export function highlightText(root: HTMLElement, query: string, names: { match: string; current: string }, nodes: { include: (node: Node) => boolean; isCurrent: (node: Node) => boolean }): void {
  const needle = query.toLocaleLowerCase();
  const matches: Range[] = [];
  const current: Range[] = [];
  if (needle) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (node) => nodes.include(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.nodeValue?.toLocaleLowerCase() ?? "";
      for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + needle.length)) {
        const range = new Range();
        range.setStart(node, index);
        range.setEnd(node, index + needle.length);
        (nodes.isCurrent(node) ? current : matches).push(range);
      }
    }
  }
  CSS.highlights.set(names.match, new Highlight(...matches));
  CSS.highlights.set(names.current, new Highlight(...current));
}

export function clearHighlights(...names: string[]): void {
  for (const name of names) CSS.highlights.delete(name);
}
