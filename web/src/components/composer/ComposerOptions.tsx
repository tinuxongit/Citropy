import type { Ref } from "react";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import {
  Brain,
  ChevronDown,
  Layers,
  ListChecks,
  Pencil,
  ShieldCheck,
  Zap,
} from "../icons.ts";
import { Menu } from "../Menu.tsx";
import { configureThread } from "../../lib/actions.ts";
import { effortLabel as formatEffort, tokens } from "../../lib/format.ts";
import { currentLocale, useI18n } from "../../lib/i18n.ts";
import { effectiveEffort } from "../../../../shared/model-options.ts";
import type {
  ModelOption,
  PermissionMode,
  ThreadMeta,
} from "../../../../shared/protocol.ts";

const MODES: Array<{
  id: PermissionMode;
  label: string;
  hint: string;
  icon: typeof ShieldCheck;
}> = [
  {
    id: "manual",
    label: "Ask before changes",
    hint: "Review tools before they run",
    icon: LockKeyhole,
  },
  {
    id: "acceptEdits",
    label: "Auto edits",
    hint: "Allow file edits; ask for other actions",
    icon: Pencil,
  },
  {
    id: "plan",
    label: "Plan only",
    hint: "Explore and plan without editing files",
    icon: ListChecks,
  },
  {
    id: "bypass",
    label: "Full access",
    hint: "Allow tools without approval prompts",
    icon: UnlockKeyhole,
  },
];

const contextLabel = (size: number) =>
  tokens(size).replace(/\.00M$/, "M");

export function hasModelOptions(model: ModelOption | undefined) {
  return Boolean(
    model?.efforts?.length || model?.contextWindows?.length || model?.fastMode,
  );
}

export function ModelOptionsMenu({
  thread,
  model,
  disabled,
  buttonRef,
}: {
  thread: ThreadMeta;
  model: ModelOption | undefined;
  disabled: boolean;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const t = useI18n();
  const effort = effectiveEffort(model, thread.effort);
  const effortLabel = effort ? formatEffort(effort) : t("Model options");
  const contextWindow = thread.contextWindow ?? model?.contextMax;
  const contextDescription = contextWindow
    ? t("Context window: {count} tokens", { count: contextWindow.toLocaleString(currentLocale()) })
    : undefined;
  return (
    <Menu
      width={280}
      items={[
        ...(model?.efforts ?? []).map((value) => ({
          id: `effort-${value}`,
          section: t("Reasoning effort"),
          icon: <Brain size={16} className="option-reasoning" />,
          label: formatEffort(value),
          selected: effort === value,
          onSelect: () => configureThread(thread.id, { effort: value }),
        })),
        ...(model?.contextWindows ?? []).map((size) => ({
          id: `context-${size}`,
          section: t("Context window"),
          icon: <Layers size={16} className="option-context" />,
          label: `${contextLabel(size)} tokens`,
          selected: contextWindow === size,
          onSelect: () =>
            configureThread(thread.id, { contextWindow: size }),
        })),
        ...(model?.fastMode
          ? [true, false].map((on) => ({
              id: `fast-${on}`,
              section: t("Fast mode"),
              icon: (
                <Zap
                  size={16}
                  className={on ? "option-fast" : "muted"}
                />
              ),
              label: on ? t("On") : t("Off"),
              hint: on
                ? (model.fastModeHint ?? t("Faster responses, increased usage"))
                : t("Standard speed and usage"),
              selected: Boolean(thread.fastMode) === on,
              onSelect: () =>
                configureThread(thread.id, { fastMode: on }),
            }))
          : []),
      ]}
      trigger={({ toggle, id, open }) => (
        <button
          id={id}
          aria-haspopup="menu"
          aria-expanded={open}
          className="composer-select"
          type="button"
          disabled={disabled}
          onClick={toggle}
          ref={buttonRef}
          title={contextDescription ? `${t("Model options")} · ${contextDescription}` : t("Model options")}
          aria-label={`${t("Model options")}: ${effortLabel}${contextWindow ? `, ${contextLabel(contextWindow)} ${t("context")}` : ""}${thread.fastMode ? `, ${t("fast mode on")}` : ""}`}
        >
          {thread.fastMode ? (
            <Zap size={14} className="option-fast" />
          ) : (
            <Brain size={14} className="option-reasoning" />
          )}
          <span>
            {effort
              ? effortLabel
              : contextWindow
                ? contextLabel(contextWindow)
                : t("Options")}
          </span>
          {effort && contextWindow && (
            <span className="composer-context" title={contextDescription}>
              {contextLabel(contextWindow)}
            </span>
          )}
          <ChevronDown size={11} />
        </button>
      )}
    />
  );
}

export function PermissionMenu({
  thread,
  disabled,
  buttonRef,
}: {
  thread: ThreadMeta;
  disabled: boolean;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const t = useI18n();
  const mode =
    MODES.find((entry) => entry.id === thread.permissionMode) ?? MODES[0];
  const ModeIcon = mode?.icon ?? ShieldCheck;
  return (
    <Menu
      header={t("Permissions")}
      width={290}
      items={MODES.map((entry) => ({
        id: entry.id,
        label: t(entry.label),
        icon: (
          <entry.icon
            size={17}
            className={`option-permission ${entry.id}`}
          />
        ),
        hint: t(entry.hint),
        selected: entry.id === thread.permissionMode,
        onSelect: () =>
          configureThread(thread.id, { permissionMode: entry.id }),
      }))}
      trigger={({ toggle, id, open }) => (
        <button
          id={id}
          aria-haspopup="menu"
          aria-expanded={open}
          className="composer-select"
          type="button"
          disabled={disabled}
          onClick={toggle}
          ref={buttonRef}
          data-tone={thread.permissionMode}
        >
          <ModeIcon
            size={14}
            className={`option-permission ${thread.permissionMode}`}
          />
          <span className="truncate">{mode && t(mode.label)}</span>
          <ChevronDown size={11} className="muted" />
        </button>
      )}
    />
  );
}
