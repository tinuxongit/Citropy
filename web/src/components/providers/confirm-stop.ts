import { confirmAction } from "../../lib/store.ts";

export async function confirmStop(active: number, title: string, label: string): Promise<boolean> {
  return !active || confirmAction({
    title,
    description: `This stops ${active} active ${active === 1 ? "conversation" : "conversations"}. Saved conversations will remain available.`,
    label,
    danger: true,
  });
}
