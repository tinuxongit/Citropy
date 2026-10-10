import { useEffect, useState, type ComponentType, type PointerEvent, type ReactNode, type Ref } from "react";
import { BoltIcon } from "../BoltIcon.tsx";
import { EditIcon } from "../icons/pencil.tsx";
import { EffortIcon } from "../EffortIcon.tsx";
import { LayersIcon } from "../LayersIcon.tsx";
import { LockIcon, UnlockIcon } from "../LockIcon.tsx";
import { PlanIcon } from "../PlanIcon.tsx";
import { Menu } from "../Menu.tsx";
import { configureThread } from "../../lib/actions.ts";
import { effortLabel as formatEffort, tokens } from "../../lib/format.ts";
import { LOCALE } from "../../lib/locale.ts";
import { effectiveEffort } from "../../../../shared/model-options.ts";
import { SelectionHighlight } from "../SelectionHighlight.tsx";
import { AnimatePresence, motion, useSpring, type MotionStyle } from "motion/react";
import { useReducedMotion } from "../../lib/use-reduced-motion.ts";
import type {
  ModelOption,
  PermissionMode,
  ThreadMeta,
} from "../../../../shared/protocol.ts";

const BAR_ICON_SIZE = 18;
const FAST_BADGE_SIZE = 14;

export const PERMISSION_MODES: Array<{
  id: PermissionMode;
  label: string;
  hint: string;
  icon: ComponentType<{ size?: number }>;
}> = [
  {
    id: "manual",
    label: "Ask before changes",
    hint: "Review tools before they run",
    icon: LockIcon,
  },
  {
    id: "acceptEdits",
    label: "Auto edits",
    hint: "Allow file edits; ask for other actions",
    icon: EditIcon,
  },
  {
    id: "plan",
    label: "Plan only",
    hint: "Explore and plan without editing files",
    icon: PlanIcon,
  },
  {
    id: "bypass",
    label: "Full access",
    hint: "Allow tools without approval prompts",
    icon: UnlockIcon,
  },
];

const contextLabel = (size: number) =>
  tokens(size).replace(/\.00M$/, "M");

export type TuningTab = "effort" | "context" | "speed";

export type TuningSettings = Partial<Pick<ThreadMeta, "effort" | "contextWindow" | "fastMode">>;

export function ModelTuning({
  settings,
  model,
  onChange,
  only,
}: {
  settings: TuningSettings;
  model: ModelOption | undefined;
  onChange: (patch: TuningSettings) => void;
  only?: TuningTab[];
}) {
  const efforts = model?.efforts ?? [];
  const effort = effectiveEffort(model, settings.effort);
  const level = effort ? efforts.indexOf(effort) : 0;
  const contextWindow = settings.contextWindow ?? model?.contextMax;
  const tabs: Array<{ id: TuningTab; label: string; icon: ComponentType<{ size?: number }> }> = [
    ...(efforts.length ? [{ id: "effort" as const, label: "Effort", icon: EffortIcon }] : []),
    ...(model?.contextWindows?.length ? [{ id: "context" as const, label: "Context", icon: LayersIcon }] : []),
    ...(model?.fastMode ? [{ id: "speed" as const, label: "Speed", icon: BoltIcon }] : []),
  ].filter((entry) => !only || only.includes(entry.id));
  const [chosen, setChosen] = useState<TuningTab>();
  const tab = tabs.find((entry) => entry.id === chosen)?.id ?? tabs[0]?.id;
  if (!tab) return null;
  return (
    <div className="model-tuning">
      {tabs.length > 1 && (
        <div className="tuning-tabs sliding-selection" role="tablist" aria-orientation="vertical" aria-label="Model options">
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
        <EffortSlider efforts={efforts} level={level} onChange={(index) => onChange({ effort: efforts[index] })} />
      )}
      {tab === "context" && (
        <div className="tuning-chips sliding-selection" role="group" aria-label="Context window">
          <SelectionHighlight value={String(contextWindow)} />
          {model!.contextWindows!.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={contextWindow === size}
              onClick={() => onChange({ contextWindow: size })}
            >
              {contextLabel(size)} tokens
            </button>
          ))}
        </div>
      )}
      {tab === "speed" && (
        <label className="tuning-speed">
          <span>
            <strong>Fast mode</strong>
            <small>{settings.fastMode ? (model?.fastModeHint ?? "Faster responses, increased usage") : "Standard speed and usage"}</small>
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

type EffortGrip = { position: number; phase: "held" | "released" };

function EffortSlider({
  efforts,
  level,
  onChange,
}: {
  efforts: string[];
  level: number;
  onChange: (index: number) => void;
}) {
  const [grip, setGrip] = useState<EffortGrip>();
  useEffect(() => setGrip((current) => (current?.phase === "released" && current.position === level ? undefined : current)), [level]);
  const position = grip?.position ?? level;
  const index = Math.round(position);
  const last = efforts.length - 1;
  const reducedMotion = useReducedMotion();
  const target = last > 0 ? position / last : 1;
  const fill = useSpring(target, { stiffness: 600, damping: 42 });
  useEffect(() => {
    if (reducedMotion) fill.jump(target);
    else fill.set(target);
  }, [fill, target, reducedMotion]);
  const positionAt = (track: HTMLElement, clientX: number) => {
    const stops = track.querySelectorAll(".effort-slider-stop");
    const start = centerX(stops[0]!);
    const fraction = (clientX - start) / (centerX(stops[last]!) - start);
    return Math.min(Math.max(fraction, 0), 1) * last;
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    settle(Math.round(positionAt(event.currentTarget, event.clientX)));
  };
  const settle = (settled: number) => {
    setGrip({ position: settled, phase: "released" });
    if (settled !== level) onChange(settled);
  };
  return (
    <div className="effort-slider">
      <div className="effort-slider-value">{efforts[index] && <RollingLabel text={formatEffort(efforts[index])} order={index} />}</div>
      <motion.div
        className="effort-slider-track"
        style={{ "--fill": fill } as MotionStyle}
        data-held={grip?.phase === "held" || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0 || last < 1) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setGrip({ position: positionAt(event.currentTarget, event.clientX), phase: "held" });
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          setGrip({ position: positionAt(event.currentTarget, event.clientX), phase: "held" });
        }}
        onPointerUp={release}
        onPointerCancel={() => setGrip(undefined)}
      >
        {efforts.map((value, stop) => (
          <span key={value} className="effort-slider-stop" data-passed={stop <= position || undefined} />
        ))}
        <span className="effort-slider-thumb" />
        <input
          type="range"
          min={0}
          max={last}
          step={1}
          value={index}
          aria-label="Reasoning effort"
          aria-valuetext={efforts[index] && formatEffort(efforts[index])}
          disabled={last < 1}
          onChange={(event) => settle(Number(event.target.value))}
        />
      </motion.div>
    </div>
  );
}

const roll = {
  enter: (direction: number) => ({ y: `${direction * 100}%`, opacity: 0 }),
  center: { y: "0%", opacity: 1 },
  exit: (direction: number) => ({ y: `${direction * -100}%`, opacity: 0 }),
};

function RollingLabel({ text, order }: { text: string; order: number }) {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState({ order, direction: 1 });
  if (shown.order !== order) setShown({ order, direction: order > shown.order ? 1 : -1 });
  if (reducedMotion) return <span className="rolling-label">{text}</span>;
  return (
    <span className="rolling-label">
      <AnimatePresence initial={false} custom={shown.direction}>
        <motion.span
          key={text}
          custom={shown.direction}
          variants={roll}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

const centerX = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return rect.left + rect.width / 2;
};

export function PermissionMenu({
  thread,
  disabled,
  buttonRef,
}: {
  thread: ThreadMeta;
  disabled: boolean;
  buttonRef: Ref<HTMLButtonElement>;
}) {
  const mode =
    PERMISSION_MODES.find((entry) => entry.id === thread.permissionMode) ?? PERMISSION_MODES[0]!;
  return (
    <Menu
      width={290}
      items={PERMISSION_MODES.map((entry) => ({
        id: entry.id,
        label: entry.label,
        icon: <entry.icon size={17} />,
        hint: entry.hint,
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
          aria-label={`Permissions: ${mode.label}`}
        >
          <mode.icon size={BAR_ICON_SIZE} />
          <span className="composer-label">{mode.label}</span>
        </button>
      )}
    />
  );
}

export function EffortMenu({
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
  const efforts = model?.efforts ?? [];
  const effort = effectiveEffort(model, thread.effort);
  if (!effort && !model?.fastMode) return null;
  const label = effort ? formatEffort(effort) : thread.fastMode ? "Fast" : "Standard";
  const choices = effort ? efforts.map(formatEffort) : ["Standard", "Fast"];
  return (
    <TuningMenu thread={thread} model={model} tabs={["effort", "speed"]} disabled={disabled} buttonRef={buttonRef} className="composer-effort" label={`Effort and speed: ${label}${effort && thread.fastMode ? ", fast mode on" : ""}`}>
      {effort ? <EffortIcon size={BAR_ICON_SIZE} filled={(efforts.indexOf(effort) + 1) / efforts.length} /> : <BoltIcon size={BAR_ICON_SIZE} />}
      <span className="composer-label composer-label-stack">
        {choices.map((choice) => <span key={choice} data-current={choice === label || undefined}>{choice}</span>)}
      </span>
      {effort && thread.fastMode && <BoltIcon size={FAST_BADGE_SIZE} />}
    </TuningMenu>
  );
}

export function ContextMenu({
  thread,
  model,
  disabled,
}: {
  thread: ThreadMeta;
  model: ModelOption | undefined;
  disabled: boolean;
}) {
  const contextWindow = thread.contextWindow ?? model?.contextMax;
  if (!contextWindow || !model?.contextWindows?.length) return null;
  return (
    <TuningMenu thread={thread} model={model} tabs={["context"]} disabled={disabled} className="composer-context" label={`Context window: ${contextWindow.toLocaleString(LOCALE)} tokens`}>
      <LayersIcon size={BAR_ICON_SIZE} />
      <span className="composer-label">{contextLabel(contextWindow)}</span>
    </TuningMenu>
  );
}

function TuningMenu({
  thread,
  model,
  tabs,
  disabled,
  buttonRef,
  className,
  label,
  children,
}: {
  thread: ThreadMeta;
  model: ModelOption | undefined;
  tabs: TuningTab[];
  disabled: boolean;
  buttonRef?: Ref<HTMLButtonElement>;
  className: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Menu
      width={260}
      className="tuning-menu"
      items={[]}
      controls={<ModelTuning settings={thread} model={model} onChange={(patch) => configureThread(thread.id, patch)} only={tabs} />}
      trigger={({ toggle, id, open }) => (
        <button
          id={id}
          aria-haspopup="menu"
          aria-expanded={open}
          className={`composer-select ${className}`}
          type="button"
          disabled={disabled}
          onClick={toggle}
          ref={buttonRef}
          aria-label={label}
          title={label}
        >
          {children}
        </button>
      )}
    />
  );
}
