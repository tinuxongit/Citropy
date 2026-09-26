export type Language = "en" | "es";
export type TranslationValues = Record<string, string | number>;
export type Translator = (message: string, values?: TranslationValues, context?: string) => string;

let spanish: Record<string, string> = {};

export async function loadSpanish(): Promise<void> {
  spanish = (await import("./locales/es.ts")).spanish;
}

export function translateFor(language: Language, message: string, values?: TranslationValues, context?: string): string {
  const key = context ? `${context}:${message}` : message;
  const translated = language !== "es" ? message
    : Object.hasOwn(spanish, key) ? spanish[key]!
    : Object.hasOwn(spanish, message) ? spanish[message]!
    : message;
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
