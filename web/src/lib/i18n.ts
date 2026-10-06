export type TranslationValues = Record<string, string | number>;
export type Translator = (message: string, values?: TranslationValues) => string;

export const LOCALE = "en-US";

export const translate: Translator = (message, values) => values
  ? message.replace(/\{(\w+)\}/g, (match, key: string) => Object.hasOwn(values, key) ? String(values[key]) : match)
  : message;

export function useI18n(): Translator {
  return translate;
}
