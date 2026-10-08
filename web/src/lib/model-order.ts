import type { ModelOption } from "../../../shared/protocol.ts";

const VERSION = /\d+(?:\.\d+)*/;

function family(label: string) {
  return label.replace(VERSION, "#");
}

function version(label: string) {
  return VERSION.exec(label)?.[0].split(".").map(Number) ?? [];
}

function newerFirst(a: number[], b: number[]) {
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const difference = (b[index] ?? 0) - (a[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

export function byFamily(models: ModelOption[]): ModelOption[] {
  const families = [...new Set(models.map(model => family(model.label)))];
  return models
    .map((model, index) => ({ model, index, family: families.indexOf(family(model.label)), version: version(model.label) }))
    .sort((a, b) => a.family - b.family || newerFirst(a.version, b.version) || a.index - b.index)
    .map(entry => entry.model);
}
