import { awaitResponse } from "./requests.ts";
import { requestId, send } from "./socket.ts";
import { useApp } from "./store.ts";

export function findInThread(threadId: string, query: string): Promise<string[]> {
  const id = requestId();
  const response = awaitResponse<string[]>(id);
  send({ t: "thread.find", requestId: id, threadId, query });
  return response;
}

export function openChatFind(): void {
  if (!useApp.getState().chatFindOpen) useApp.setState({ chatFindOpen: true });
  else document.querySelector<HTMLInputElement>(".find-bar input")?.select();
}

export function closeChatFind(): void {
  useApp.setState({ chatFindOpen: false });
}
