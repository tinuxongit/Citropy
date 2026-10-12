import { create } from "zustand";

export const useBrowserTakeover = create<{ tabId?: string; questionId?: string }>(() => ({}));

export function expandBrowser(tabId: string, questionId?: string): void {
  useBrowserTakeover.setState({ tabId, questionId });
}

export function collapseBrowser(): void {
  useBrowserTakeover.setState({ tabId: undefined, questionId: undefined });
}

export function collapseForQuestion(questionId: string): void {
  if (useBrowserTakeover.getState().questionId === questionId) collapseBrowser();
}
