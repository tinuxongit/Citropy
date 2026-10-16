function blockquote(text: string): string {
  return text
    .trim()
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

export function withQuotes(quotes: string[], text: string): string {
  return [...quotes.map(blockquote), text.trim()].filter(Boolean).join("\n\n");
}
