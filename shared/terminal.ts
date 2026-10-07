import type { PanelTab } from "./workbench.ts";

export const RETAINED_OUTPUT_LENGTH = 200_000;

export interface TerminalSession {
  id: string;
  cwd: string;
  command?: string;
  panel?: PanelTab;
  output: string;
  offset: number;
  sessionId?: string;
  running: boolean;
  busy?: boolean;
  process?: string;
  code?: number;
}

export interface TerminalOpenInput {
  id: string;
  cwd: string;
  cols: number;
  rows: number;
  command?: string;
  panel?: PanelTab;
  env?: Record<string, string>;
}

export type TerminalEvent = { type: "data"; id: string; data: string; offset: number } | { type: "activity"; id: string; busy?: boolean; process?: string } | { type: "exit"; id: string; code: number };

export type TerminalRequest =
  | { op: "hello"; version: 1; token: string; activity?: boolean }
  | { op: "list" }
  | { op: "open"; input: TerminalOpenInput }
  | { op: "write"; termId: string; data: string }
  | { op: "resize"; termId: string; cols: number; rows: number }
  | { op: "flow"; termId: string; paused: boolean }
  | { op: "close"; termId: string }
  | { op: "closeAll" };

export function exitNotice(code: number): string {
  return `\r\n[process exited with code ${code}]\r\n`;
}

export function appendOutput(session: Pick<TerminalSession, "output" | "offset">, text: string): void {
  session.output = (session.output + text).slice(-RETAINED_OUTPUT_LENGTH);
  session.offset += text.length;
}
