import type { ComponentType } from "react";
import type { IconProps } from "./icons/kit.tsx";
import { AtomIcon, PresentationIcon } from "./icons/objects.tsx";
import { BracesIcon, CodeXmlIcon } from "./icons/editing.tsx";
import { BoxIcon, DatabaseIcon, PackageIcon } from "./icons/hardware.tsx";
import { FileArchiveIcon, FileAudioIcon, FileCodeIcon, FileCogIcon, FileImageIcon, FileKeyIcon, FileLockIcon, FileSpreadsheetIcon, FileTextIcon, FileTypeIcon, FileVideoIcon, PageIcon } from "./icons/files.tsx";
import { BranchIcon } from "./icons/git.tsx";
import { HashIcon } from "./icons/marks.tsx";
import { PenNibIcon } from "./icons/drawing.tsx";
import { TerminalIcon } from "./icons/squares.tsx";
import { fileTypeFor, type FileType } from "../lib/file-type.ts";

const icons: Record<FileType, { icon?: ComponentType<IconProps>; mark?: string; tone: string }> = {
  typescript: { mark: "TS", tone: "blue" },
  javascript: { mark: "JS", tone: "gold" },
  react: { icon: AtomIcon, tone: "cyan" },
  python: { mark: "PY", tone: "blue" },
  rust: { mark: "RS", tone: "orange" },
  go: { mark: "GO", tone: "cyan" },
  ruby: { mark: "RB", tone: "red" },
  java: { mark: "J", tone: "orange" },
  kotlin: { mark: "KT", tone: "purple" },
  c: { mark: "C", tone: "blue" },
  cpp: { mark: "C++", tone: "blue" },
  csharp: { mark: "C#", tone: "purple" },
  php: { mark: "PHP", tone: "purple" },
  swift: { mark: "SW", tone: "orange" },
  lua: { mark: "LUA", tone: "blue" },
  vue: { mark: "V", tone: "green" },
  svelte: { mark: "S", tone: "orange" },
  html: { icon: CodeXmlIcon, tone: "orange" },
  css: { icon: HashIcon, tone: "blue" },
  sass: { icon: HashIcon, tone: "pink" },
  json: { icon: BracesIcon, tone: "gold" },
  config: { icon: FileCogIcon, tone: "purple" },
  markdown: { mark: "MD", tone: "blue" },
  text: { icon: FileTextIcon, tone: "neutral" },
  document: { icon: FileTextIcon, tone: "blue" },
  pdf: { mark: "PDF", tone: "red" },
  spreadsheet: { icon: FileSpreadsheetIcon, tone: "green" },
  presentation: { icon: PresentationIcon, tone: "orange" },
  vector: { icon: PenNibIcon, tone: "pink" },
  image: { icon: FileImageIcon, tone: "purple" },
  audio: { icon: FileAudioIcon, tone: "pink" },
  video: { icon: FileVideoIcon, tone: "purple" },
  archive: { icon: FileArchiveIcon, tone: "gold" },
  shell: { icon: TerminalIcon, tone: "green" },
  database: { icon: DatabaseIcon, tone: "cyan" },
  font: { icon: FileTypeIcon, tone: "pink" },
  lock: { icon: FileLockIcon, tone: "gold" },
  certificate: { icon: FileKeyIcon, tone: "green" },
  binary: { icon: FileCodeIcon, tone: "neutral" },
  git: { icon: BranchIcon, tone: "orange" },
  docker: { icon: BoxIcon, tone: "blue" },
  package: { icon: PackageIcon, tone: "red" },
  file: { icon: PageIcon, tone: "neutral" },
};

export function FileIcon({ path, mime, size = 16, className = "" }: { path: string; mime?: string; size?: number; className?: string }) {
  const type = fileTypeFor(path, mime);
  const { icon: Icon, mark, tone } = icons[type];
  const props = { className: `file-type-icon ${className}`, "data-file-type": type, "data-tone": tone, "aria-hidden": true as const, focusable: false as const };
  return Icon ? <Icon {...props} size={size} /> : (
    <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <rect x="1.5" y="1.5" width="21" height="21" rx="3" fillOpacity="0.14" />
      <text x="12" y="16" textAnchor="middle" fontFamily="var(--font-ui)" fontWeight="750" fontSize={mark!.length > 2 ? 8.5 : 11}>{mark}</text>
    </svg>
  );
}
