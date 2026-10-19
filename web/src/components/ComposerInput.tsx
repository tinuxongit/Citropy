import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { BookIcon } from "./icons/BookIcon.tsx";
import { SiteIcon } from "./icons/SiteIcon.tsx";
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
import { BotAvatar } from "./bots/BotAvatar.tsx";
import { GroupAvatar } from "./bots/GroupAvatar.tsx";
import { useGroupMembers } from "./bots/use-group-members.ts";
import { EVERYONE_HANDLE, botHandle } from "../../../shared/bots.ts";

const CITROPY_MARK = <span className="citropy-mark" aria-hidden="true" />;

const tagIcon = (tag: MentionTag) =>
  tag.icon === "site" ? (
    <SiteIcon url={tag.url!} />
  ) : tag.icon === "citropy" ? (
    CITROPY_MARK
  ) : (
    <BookIcon size={16} />
  );

const MENTION_AVATAR_SIZE = 16;

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
  const botName = useApp((state) => state.bots[thread.botId ?? ""]?.name);
  const group = useApp((state) => state.botGroups[thread.groupId ?? ""]);
  const steer = useApp(
    (state) => state.providers.find((entry) => entry.id === thread.provider)?.capabilities?.steer,
  );
  const members = useGroupMembers(group);
  const mention = /(?:^|\s)@([^\s\[\]]*)$/.exec(value.slice(0, caret));
  const slash = !group && /^\/[\w.:-]*$/.test(value) ? value : undefined;
  const query = mention ? `@${mention[1]}` : slash;
  const mode = mention ? (group ? "members" : "skills") : slash ? "commands" : undefined;
  const hasMentions = /(?:^|\s)@([\w.:-]+)/.test(value);
  const catalogMode = group
    ? undefined
    : mode === "commands"
      ? "commands"
      : mode === "skills" || hasMentions
        ? "skills"
        : undefined;
  const { skills, tools, nativeCommands, paths, loading, error } = useComposerCatalog({
    thread,
    mode: mode === "members" ? undefined : mode,
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
    .sort((a, b) => Number(b.scope === "project") - Number(a.scope === "project"))
    .filter(
      (skill, index, entries) => entries.findIndex((entry) => entry.name === skill.name) === index,
    );
  const citropyTools = tools.filter((tool) => !enabled.some((skill) => skill.name === tool.name));
  const everyone = group && {
    id: EVERYONE_HANDLE,
    section: "Bots",
    label: `@${EVERYONE_HANDLE}`,
    title: "Everyone",
    hint: "Every bot in this group",
    icon: <GroupAvatar group={group} size={MENTION_AVATAR_SIZE} />,
  };
  const memberOptions: SuggestionOption[] = [
    ...members.map((bot) => ({
      id: bot.id,
      section: "Bots",
      label: `@${botHandle(bot.name)}`,
      title: bot.name,
      hint: bot.title,
      icon: <BotAvatar bot={bot} size={MENTION_AVATAR_SIZE} />,
    })),
    ...(everyone ? [everyone] : []),
  ];
  const mentions = new Map<string, MentionLook>(
    group
      ? memberOptions.map(
          (option) =>
            [
              option.label.slice(1),
              { label: option.title ?? option.label, icon: option.icon },
            ] as const,
        )
      : [...enabled.map(skillTag), ...citropyTools.map(toolTag)].map(
          (tag) => [tag.name, { label: tag.title, icon: tagIcon(tag) }] as const,
        ),
  );
  const toolOptions: SuggestionOption[] = citropyTools
    .filter((tool) => tool.name.includes((mention?.[1] ?? "").toLowerCase()))
    .map((tool) => ({
      id: `tool:${tool.name}`,
      section: tool.section,
      label: `@${tool.name}`,
      title: tool.title,
      hint: tool.description,
      icon: tagIcon(toolTag(tool)),
    }));
  const localCommandNames = new Set(commands.map((command) => command.label.slice(1)));
  const lines = (mention?.[1] ?? "").match(/#L\d+(?:-L?\d+)?$/)?.[0] ?? "";
  const options: SuggestionOption[] =
    mode === "members"
      ? memberOptions.filter((option) =>
          option.label.toLowerCase().startsWith(`@${mention?.[1] ?? ""}`.toLowerCase()),
        )
      : mode === "skills"
        ? [
            ...toolOptions.filter((option) => option.section === "Citropy"),
            ...paths.map((entry) => {
              const slash = entry.path.lastIndexOf("/");
              return {
                id: `context:${entry.path}`,
                section: "Files",
                label: `${contextReference(entry.path)}${lines}`,
                title: `${entry.path.slice(slash + 1)}${entry.dir ? "/" : lines}`,
                hint: entry.path.slice(0, Math.max(0, slash)),
                icon: entry.dir ? <FolderIcon size={16} /> : <FileTextIcon size={16} />,
              };
            }),
            ...enabled
              .filter((skill) =>
                skill.name.toLowerCase().includes((mention?.[1] ?? "").toLowerCase()),
              )
              .map((skill) => ({
                id: skill.id,
                section: "Skills",
                label: `@${skill.name}`,
                title: skill.name,
                hint: skill.description,
                tag: skill.scope,
                icon: tagIcon(skillTag(skill)),
              })),
            ...toolOptions.filter((option) => option.section !== "Citropy"),
          ]
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
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [index, query]);
  const choose = (label: string) => {
    const next = mention
      ? value.slice(0, caret - (mention[1] ?? "").length - 1) + label + " " + value.slice(caret)
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
            aria-label={
              mode === "members" ? "Bots" : mode === "skills" ? "Files and skills" : "Commands"
            }
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
            {loading && (
              <p role="status">{mode === "skills" ? "Loading skills…" : "Loading commands…"}</p>
            )}
            {!options.length && !loading && !error && (
              <p>
                {mode === "members"
                  ? "No matching bots in this group."
                  : mode === "skills"
                    ? "No matching files, skills, Citropy tools, or connections."
                    : "No matching commands."}
              </p>
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
              ? steer
                ? "Steer the agent…"
                : "Queue a follow-up…"
              : group || botName
                ? `Message ${group?.name ?? botName}`
                : thread.chat
                  ? "Ask anything…"
                  : "Ask anything, @ for files and skills, / for commands"
        }
        onKey={(event) => {
          if (visible && event.key === "Escape") {
            setDismissed(query);
            return true;
          }
          if (visible && activeOption) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              setSelected(
                (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length,
              );
              return true;
            }
            if (
              event.key === "Tab" ||
              (event.key === "Enter" &&
                !event.shiftKey &&
                (mode !== "commands" || activeOption.label !== value.trim()))
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
