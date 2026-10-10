export type DropEdge = "before" | "after";

export function moveBeside<T>(items: T[], item: T, target: T, edge: DropEdge): T[] {
  if (item === target || !items.includes(item) || !items.includes(target)) return items;
  const next = items.filter((entry) => entry !== item);
  next.splice(next.indexOf(target) + (edge === "after" ? 1 : 0), 0, item);
  return next.every((entry, index) => entry === items[index]) ? items : next;
}
