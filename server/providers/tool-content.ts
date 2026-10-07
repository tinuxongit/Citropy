export interface ToolContent {
  text: string;
  images: Array<{ mime: string; data: string }>;
}

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;

function imageOf(record: Record<string, unknown>): ToolContent["images"][number] | undefined {
  const source = record.source as { type?: unknown; media_type?: unknown; data?: unknown } | undefined;
  if (source?.type === "base64" && typeof source.media_type === "string" && typeof source.data === "string") return { mime: source.media_type, data: source.data };
  if (typeof record.data === "string" && typeof record.mimeType === "string") return { mime: record.mimeType, data: record.data };
  const url = typeof record.imageUrl === "string" ? DATA_URL.exec(record.imageUrl) : null;
  if (url) return { mime: url[1]!, data: url[2]! };
}

export function toolContent(content: unknown): ToolContent {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: content == null ? "" : JSON.stringify(content), images: [] };
  const images: ToolContent["images"] = [];
  const text: string[] = [];
  for (const entry of content) {
    if (typeof entry === "string") {
      text.push(entry);
      continue;
    }
    const record = entry as Record<string, unknown>;
    if ((record.type === "text" || record.type === "inputText") && typeof record.text === "string") {
      text.push(record.text);
      continue;
    }
    if (record.type === "image" || record.type === "inputImage") {
      const image = imageOf(record);
      if (image) images.push(image);
      continue;
    }
    text.push(JSON.stringify(record));
  }
  return { text: text.join("\n"), images };
}
