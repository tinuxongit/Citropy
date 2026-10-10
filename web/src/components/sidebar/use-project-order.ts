import { useMemo, useState } from "react";
import type { Project } from "../../../../shared/protocol.ts";

import { moveBeside, type DropEdge } from "../../../../shared/move-beside.ts";

const storageKey = (environment: string) => `citropy.globalProjectOrder.${environment}`;

function readProjectOrder(environment: string): string[] {
  const order = JSON.parse(localStorage.getItem(storageKey(environment)) ?? "[]");
  return Array.isArray(order) ? order.filter((id): id is string => typeof id === "string") : [];
}

function orderProjects(projects: Project[], order: string[]): Project[] {
  const positions = new Map(order.map((id, index) => [id, index]));
  return [...projects].sort((a, b) => (positions.get(a.id) ?? -1) - (positions.get(b.id) ?? -1));
}

export function useProjectOrder(projectsByEnvironment: Record<string, Project[]>) {
  const [orders, setOrders] = useState<Record<string, string[]>>({});
  const orderedProjects = useMemo(() => Object.fromEntries(Object.entries(projectsByEnvironment).map(([environment, projects]) =>
    [environment, orderProjects(projects, orders[environment] ?? readProjectOrder(environment))],
  )), [projectsByEnvironment, orders]);
  const moveProject = (environment: string, source: string, target: string, edge: DropEdge) => {
    const order = (orderedProjects[environment] ?? []).map((project) => project.id);
    const ids = moveBeside(order, source, target, edge);
    if (ids === order) return;
    localStorage.setItem(storageKey(environment), JSON.stringify(ids));
    setOrders((current) => ({ ...current, [environment]: ids }));
  };
  return { orderedProjects, moveProject };
}
