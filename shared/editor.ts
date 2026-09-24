export interface EditorFile {
  text: string;
  revision: string;
}

export const EDITOR_MAX_BYTES = 2 * 1024 * 1024;
