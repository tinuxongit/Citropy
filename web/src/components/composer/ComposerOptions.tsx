import { useState, type CSSProperties, type Ref } from "react";
import { LockKeyhole, UnlockKeyhole } from "lucide-react";
import {
  Brain,
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
import { SelectionHighlight } from "../SelectionHighlight.tsx";
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

export function ModelDetail({
  thread,
  model,
}: {
  thread: ThreadMeta;
  model: ModelOption | undefined;
}) {
  const t = useI18n();
  const effort = effectiveEffort(model, thread.effort);
  const contextWindow = thread.contextWindow ?? model?.contextMax;
  if (!hasModelOptions(model)) return null;
  return (
    <span className="composer-detail">
      {effort && <span>{formatEffort(effort)}</span>}
      {(thread.fastMode || contextWindow) && (
        <span className="hover-reveal">
          <span>
            {contextWindow && (
              <span
                className="composer-context"
                title={t("Context window: {count} tokens", { count: contextWindow.toLocaleString(currentLocale()) })}
              >
                {contextLabel(contextWindow)}
              </span>
            )}
            {thread.fastMode && <Zap size={12} className="option-fast" aria-label={t("fast mode on")} />}
          </span>
        </span>
      )}
    </span>
  );
}

type TuningTab = "effort" | "context" | "speed";

export type TuningSettings = Partial<Pick<ThreadMeta, "effort" | "contextWindow" | "fastMode">>;

export function ModelTuning({
  settings,
  model,
  onChange,
}: {
  settings: TuningSettings;
  model: ModelOption | undefined;
  onChange: (patch: TuningSettings) => void;
}) {
  const t = useI18n();
  const efforts = model?.efforts ?? [];
  const effort = effectiveEffort(model, settings.effort);
  const level = effort ? efforts.indexOf(effort) : 0;
  const contextWindow = settings.contextWindow ?? model?.contextMax;
  const tabs: Array<{ id: TuningTab; label: string; icon: typeof Brain }> = [
    ...(efforts.length ? [{ id: "effort" as const, label: t("Effort"), icon: Brain }] : []),
    ...(model?.contextWindows?.length ? [{ id: "context" as const, label: t("Context"), icon: Layers }] : []),
    ...(model?.fastMode ? [{ id: "speed" as const, label: t("Speed"), icon: Zap }] : []),
  ];
  const [chosen, setChosen] = useState<TuningTab>();
  const tab = tabs.find((entry) => entry.id === chosen)?.id ?? tabs[0]?.id;
  if (!tab) return null;
  return (
    <div className="model-tuning">
      {tabs.length > 1 && (
        <div className="tuning-tabs sliding-selection" role="tablist" aria-orientation="vertical" aria-label={t("Model options")}>
          <SelectionHighlight value={tab} />
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              aria-label={entry.label}
              title={entry.label}
              onClick={() => setChosen(entry.id)}
            >
              <entry.icon size={16} />
            </button>
          ))}
        </div>
      )}
      <div className="tuning-panel">
      {tab === "effort" && (
        <div className="effort-slider">
          <div className="effort-slider-value">{effort && formatEffort(effort)}</div>
          <div
            className="effort-slider-track"
            style={{ "--fill": efforts.length > 1 ? level / (efforts.length - 1) : 1 } as CSSProperties}
          >
            {efforts.map((value, index) => (
              <span key={value} className="effort-slider-stop" data-passed={index <= level || undefined} />
            ))}
            <input
              type="range"
              min={0}
              max={efforts.length - 1}
              step={1}
              value={level}
              aria-label={t("Reasoning effort")}
              aria-valuetext={effort && formatEffort(effort)}
              disabled={efforts.length < 2}
              onChange={(event) => onChange({ effort: efforts[Number(event.target.value)] })}
            />
          </div>
        </div>
      )}
      {tab === "context" && (
        <div className="tuning-chips sliding-selection" role="group" aria-label={t("Context window")}>
          <SelectionHighlight value={String(contextWindow)} />
          {model!.contextWindows!.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={contextWindow === size}
              onClick={() => onChange({ contextWindow: size })}
            >
              {contextLabel(size)} {t("tokens")}
            </button>
          ))}
        </div>
      )}
      {tab === "speed" && (
        <label className="tuning-speed">
          <span>
            <strong>{t("Fast mode")}</strong>
            <small>{settings.fastMode ? (model?.fastModeHint ?? t("Faster responses, increased usage")) : t("Standard speed and usage")}</small>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="setting-switch"
            checked={Boolean(settings.fastMode)}
            onChange={(event) => onChange({ fastMode: event.target.checked })}
          />
        </label>
      )}
      </div>
    </div>
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
        icon: <entry.icon size={17} />,
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
          className="composer-select composer-access"
          type="button"
          disabled={disabled}
          onClick={toggle}
          ref={buttonRef}
          data-tone={thread.permissionMode}
          aria-label={`${t("Permissions")}: ${mode ? t(mode.label) : ""}`}
        >
          <ModeIcon size={14} />
          <span className="hover-reveal">
            <span>
              {mode && t(mode.label)}
            </span>
          </span>
        </button>
      )}
    />
  );
}
