import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BookIcon } from "./BookIcon.tsx";
import { SiteIcon } from "./SiteIcon.tsx";
import { TerminalIcon } from "./icons/squares.tsx";
import { FolderIcon } from "./icons/folders.tsx";
import { FileTextIcon } from "./icons/files.tsx";
import { contextReference } from "../../../shared/context.ts";
import type { ThreadMeta } from "../../../shared/protocol.ts";
import { skillTag, toolTag, type MentionTag } from "../../../shared/mention-tags.ts";
import { providerLabels } from "../lib/format.ts";
import { useApp } from "../lib/store.ts";
import { useComposerCatalog } from "./composer/use-composer-catalog.ts";
import { useTypeToFocus } from "./composer/use-type-to-focus.ts";
import { MessageEditor, type MessageEditorHandle } from "./composer/MessageEditor.tsx";
import type { MentionLook } from "./composer/mention-node.tsx";

const CITROPY_MARK = <span className="citropy-mark" aria-hidden="true" />;

const tagIcon = (tag: MentionTag) =>
  tag.icon === "site" ? <SiteIcon url={tag.url!} /> : tag.icon === "citropy" ? CITROPY_MARK : <BookIcon size={16} />;

const SECTION_NOTES: Record<string, string> = { Files: "Add #L10-L20 for specific lines" };

type SuggestionOption = {
  id: string;
  section: string;
  label: string;
  title?: string;
  hint: string;
  tag?: string;
  icon: ReactNode;
};

export function ComposerInput({
  value,
  onChange,
  onSubmit,
  onFiles,
  disabled,
  thread,
  commands,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFiles: (files: File[]) => void;
  disabled: boolean;
  thread: ThreadMeta;
  commands: Array<{ id: string; label: string; hint: string; icon: ReactNode }>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<MessageEditorHandle>(null);
  const list = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(value.length);
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const connected = useApp((state) => state.connected);
  const mention = /(?:^|\s)@([^\s\[\]]*)$/.exec(value.slice(0, caret));
  const slash = /^\/[\w.:-]*$/.test(value) ? value : undefined;
  const query = mention ? `@${mention[1]}` : slash;
  const mode = mention ? "skills" : slash ? "commands" : undefined;
  const hasMentions = /(?:^|\s)@([\w.:-]+)/.test(value);
  const catalogMode = mode === "commands"
    ? "commands"
    : mode === "skills" || hasMentions ? "skills" : undefined;
  const { skills, tools, nativeCommands, paths, loading, error } = useComposerCatalog({
    thread,
    mode,
    catalogMode,
    mentionText: mention?.[1] ?? "",
  });
  const pastedFiles = useTypeToFocus({ box, disabled, onFiles });
  useEffect(() => {
    setSelected(0);
    setDismissed(undefined);
  }, [query]);
  const enabled = skills
    .filter((skill) => skill.enabled && skill.provider === thread.provider)
    .sort(
      (a, b) => Number(b.scope === "project") - Number(a.scope === "project"),
    )
    .filter(
      (skill, index, entries) =>
        entries.findIndex((entry) => entry.name === skill.name) === index,
    );
  const citropyTools = tools.filter((tool) => !enabled.some((skill) => skill.name === tool.name));
  const mentions = new Map<string, MentionLook>([
    ...[...enabled.map(skillTag), ...citropyTools.map(toolTag)].map((tag) => [tag.name, { label: tag.title, icon: tagIcon(tag) }] as const),
  ]);
  const localCommandNames = new Set(commands.map((command) => command.label.slice(1)));
  const lines = (mention?.[1] ?? "").match(/#L\d+(?:-L?\d+)?$/)?.[0] ?? "";
  const options: SuggestionOption[] =
    mode === "skills"
      ? [...paths.map(entry => {
          const slash = entry.path.lastIndexOf("/");
          return {
            id: `context:${entry.path}`,
            section: "Files",
            label: `${contextReference(entry.path)}${lines}`,
            title: `${entry.path.slice(slash + 1)}${entry.dir ? "/" : lines}`,
            hint: entry.path.slice(0, Math.max(0, slash)),
            icon: entry.dir ? <FolderIcon size={16} /> : <FileTextIcon size={16} />,
          };
        }), ...enabled
          .filter((skill) =>
            skill.name
              .toLowerCase()
              .includes((mention?.[1] ?? "").toLowerCase()),
          )
          .map((skill) => ({
            id: skill.id,
            section: "Skills",
            label: `@${skill.name}`,
            title: skill.name,
            hint: skill.description,
            tag: skill.scope,
            icon: tagIcon(skillTag(skill)),
          })), ...citropyTools
          .filter((tool) => tool.name.includes((mention?.[1] ?? "").toLowerCase()))
          .map((tool) => ({
            id: `tool:${tool.name}`,
            section: tool.section,
            label: `@${tool.name}`,
            title: tool.title,
            hint: tool.description,
            icon: tagIcon(toolTag(tool)),
          }))]
      : [
          ...commands.map((command) => ({ ...command, section: "Citropy" })),
          ...nativeCommands
            .filter(
              (command) =>
                !localCommandNames.has(command.name) &&
                !skills.some(
                  (skill) =>
                    skill.provider === thread.provider &&
                    (skill.name === command.name ||
                      skill.name === command.name.split(":").at(-1)),
                ),
            )
            .map((command) => ({
              id: `provider:${command.name}`,
              section: providerLabels[thread.provider],
              label: `/${command.name}`,
              hint: command.description,
              tag: command.argumentHint,
              icon: <TerminalIcon size={16} />,
            })),
        ].filter((command) =>
          command.label.toLowerCase().startsWith((slash ?? "").toLowerCase()),
        );
  const visible = Boolean(mode && query !== dismissed);
  const index = Math.min(selected, Math.max(0, options.length - 1));
  const activeOption = options[index];
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);
  const choose = (label: string) => {
    const next = mention
      ? value.slice(0, caret - (mention[1] ?? "").length - 1) +
        label +
        " " +
        value.slice(caret)
      : label + " ";
    const position = mention
      ? caret - (mention[1] ?? "").length - 1 + label.length + 1
      : next.length;
    editor.current!.setMessage(next, position);
  };
  return (
    <div className="composer-writing">
      {visible && (
        <div className="composer-suggestions" ref={list}>
          <div
            className="composer-suggestion-list scroll"
            id="composer-suggestions"
            role="listbox"
            aria-label={mode === "skills" ? "Files and skills" : "Commands"}
          >
            {options.map((option, i) => (
              <Fragment key={option.id}>
                {option.section !== options[i - 1]?.section && (
                  <div className="composer-suggestion-section" role="presentation">
                    {option.section}
                    {SECTION_NOTES[option.section] && <span>{SECTION_NOTES[option.section]}</span>}
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === index}
                  id={`composer-option-${i}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(option.label)}
                >
                  {option.icon}
                  <strong>{option.title ?? option.label}</strong>
                  <small>{option.hint}</small>
                  {option.tag && <em>{option.tag}</em>}
                </button>
              </Fragment>
            ))}
            {loading && <p role="status">{mode === "skills" ? "Loading skills…" : "Loading commands…"}</p>}
            {!options.length && !loading && !error && (
              <p>{mode === "skills" ? "No matching files, skills, Citropy tools, or connections." : "No matching commands."}</p>
            )}
            {error && <p role="status">{error}</p>}
          </div>
        </div>
      )}
      <MessageEditor
        box={box}
        handle={editor}
        value={value}
        onChange={onChange}
        onCaret={setCaret}
        disabled={disabled}
        mentions={mentions}
        pastedFiles={pastedFiles}
        onFiles={onFiles}
        aria-controls={visible ? "composer-suggestions" : undefined}
        aria-activedescendant={visible && options.length ? `composer-option-${index}` : undefined}
        placeholder={
          !connected
            ? "Citropy is reconnecting. Your message will wait…"
            : thread.running
              ? "Queue a follow-up…"
              : "Ask a question or describe a change…"
        }
        onKey={(event) => {
          if (visible && event.key === "Escape") {
            setDismissed(query);
            return true;
          }
          if (visible && activeOption) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setSelected(
                (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  options.length) %
                  options.length,
              );
              return true;
            }
            if (
              event.key === "Tab" ||
              (event.key === "Enter" &&
                !event.shiftKey &&
                (mode === "skills" || activeOption.label !== value.trim()))
            ) {
              choose(activeOption.label);
              return true;
            }
          }
          if (event.key === "Enter" && !event.shiftKey) {
            onSubmit();
            return true;
          }
          return false;
        }}
      />
    </div>
  );
}
