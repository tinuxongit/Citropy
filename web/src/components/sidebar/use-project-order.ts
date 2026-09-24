import { useMemo, useState } from "react";
import type { Project } from "../../../../shared/protocol.ts";

export type DropEdge = "before" | "after";

const storageKey = (environment: string) => `citropy.globalProjectOrder.${environment}`;

export function readProjectOrder(environment: string): string[] {
  try {
    const order = JSON.parse(localStorage.getItem(storageKey(environment)) ?? "[]");
    return Array.isArray(order) ? order.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function orderProjects(projects: Project[], order: string[]): Project[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...projects].sort((a, b) => (positions.get(a.id) ?? -1) - (positions.get(b.id) ?? -1));
}

export function useProjectOrder(environment: string, projects: Project[]) {
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const order = useMemo(() => orders[environment] ?? readProjectOrder(environment), [environment, orders]);
  const orderedProjects = useMemo(() => orderProjects(projects, order), [projects, order]);
  const moveProject = (source: string, target: string, edge: DropEdge) => {
    if (source === target) return;
    const ids = orderedProjects.map((project) => project.id);
    ids.splice(ids.indexOf(source), 1);
    ids.splice(ids.indexOf(target) + (edge === "after" ? 1 : 0), 0, source);
    localStorage.setItem(storageKey(environment), JSON.stringify(ids));
    setOrders((current) => ({ ...current, [environment]: ids }));
  };
  const moveProjectBy = (projectId: string, direction: -1 | 1) => {
    const index = orderedProjects.findIndex((project) => project.id === projectId);
    const adjacent = orderedProjects[index + direction];
    if (index >= 0 && adjacent) moveProject(projectId, adjacent.id, direction < 0 ? "before" : "after");
  };
  return { orderedProjects, moveProject, moveProjectBy };
}
