import { SelectionHighlight } from "./SelectionHighlight.tsx";
import { useEffect, useState, type ReactNode, type Ref } from "react";
import { SwapIcon } from "./icons/arrows.tsx";
import { CheckIcon } from "./icons/marks.tsx";
import { ChevronDownIcon } from "./icons/chevrons.tsx";
import { LockIcon } from "./LockIcon.tsx";
import { StarIcon } from "./icons/actions.tsx";
import type { WritingModel } from "../../../shared/assistance.ts";
import type { ModelOption, ProviderId, ProviderInfo } from "../../../shared/protocol.ts";
import { effectiveEffort, selectedModel } from "../../../shared/model-options.ts";
import { providerAccount } from "../../../shared/provider-account.ts";
import { toggleFavoriteModel, useApp, viewportWidth } from "../lib/store.ts";
import { effortLabel, modelLabel, modelSource } from "../lib/format.ts";
import { byFamily } from "../lib/model-order.ts";
import { send } from "../lib/socket.ts";
import { Menu } from "./Menu.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ModelTuning, type TuningSettings, type TuningTab } from "./composer/ComposerOptions.tsx";

const MENU_WIDTH = 480;
const TUNING_GUTTER = 50;

export function ModelPicker({ value, fallback, label, onChange, onTransfer, transferDisabled = false, disabled = false, allowConversation = false, automaticLabel, lockedProvider, instanceId, defaultOnly = false, className = "model-picker-trigger", buttonRef, tuning: customTuning, tune, menuClearOf }: {
  value: WritingModel | null;
  fallback?: WritingModel;
  label: string;
  onChange: (value: WritingModel | null) => void;
  onTransfer?: (value: WritingModel) => void;
  transferDisabled?: boolean;
  disabled?: boolean;
  allowConversation?: boolean;
  automaticLabel?: string;
  lockedProvider?: ProviderId;
  instanceId?: string;
  defaultOnly?: boolean;
  className?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  tuning?: (target: WritingModel | undefined) => ReactNode;
  tune?: { settings: TuningSettings; onChange: (patch: TuningSettings) => void; only?: TuningTab[] };
  menuClearOf?: string;
}) {
  const providers = useApp((state) => state.providers);
  const connected = useApp((state) => state.connected);
  const favorites = useApp((state) => state.favoriteModels);
  const choice = value ?? fallback;
  const [browsing, setBrowsing] = useState<ProviderId | "favorites" | undefined>(choice?.provider);
  const [transferring, setTransferring] = useState(false);
  const [target, setTarget] = useState<WritingModel>();
  useEffect(() => {
    setBrowsing(choice?.provider);
    setTransferring(false);
    setTarget(undefined);
  }, [choice?.provider]);
  const available = providers.filter((entry) => entry.enabled && (entry.available || (!defaultOnly && entry.instances?.some(instance => instance.available))));
  const provider = providers.find((entry) => entry.id === choice?.provider);
  const locked = transferring ? undefined : lockedProvider;
  const catalog = locked ? providers.find((entry) => entry.id === locked) : available.find((entry) => entry.id === browsing) ?? available[0];
  const currentInstanceId = choice?.providerInstanceId ?? instanceId;
  const choiceModels = providerAccount(provider, currentInstanceId).models;
  const model = selectedModel(choiceModels, choice?.model);
  const tunedEffort = tune && value ? effectiveEffort(model, tune.settings.effort) : undefined;
  const tuning = customTuning ?? (tune && (() => <ModelTuning key={`${choice?.provider}:${model?.id}`} settings={tune.settings} model={value ? model : undefined} onChange={tune.onChange} only={tune.only} />));
  const automatic = automaticLabel ?? (allowConversation ? "Use the conversation model" : undefined);
  const narrow = viewportWidth() <= 600;
  const name = !choice && automatic ? automatic : modelLabel(choiceModels, choice?.model);
  const favoritesView = browsing === "favorites";
  const catalogs = favoritesView ? available.filter((entry) => !locked || entry.id === locked) : catalog ? [catalog] : [];
  const columnProviders = locked ? (catalog ? [catalog] : []) : available;
  const accounts = (source: ProviderInfo, restrict: boolean): Array<{ id?: string; instance?: string; models: ModelOption[] }> => [
    ...(source.available ? [{ id: undefined, instance: undefined, models: byFamily(source.models) }] : []),
    ...(!defaultOnly ? (source.instances ?? []).filter(instance => instance.available).map(instance => ({ id: instance.id, instance: instance.name, models: byFamily(instance.models) })) : []),
  ].filter(account => !restrict || account.id === currentInstanceId);
  const modelHint = (source: ProviderInfo, instance: string | undefined, entry: ModelOption) => {
    const origin = modelSource(source, entry);
    return [instance, origin !== source.label && origin].filter(Boolean).join(" · ") || undefined;
  };
  const providerMark = (source: ProviderInfo) => favoritesView ? <ProviderIcon provider={source.id} /> : undefined;
  const transferItems = catalogs.flatMap(source => accounts(source, false).flatMap(account => account.models.filter(entry => !favoritesView || favorites.some(favorite => favorite.provider === source.id && favorite.providerInstanceId === account.id && favorite.model === entry.id)).map(entry => ({
    id: `${source.id}:${account.id ?? "default"}:${entry.id}`,
    label: entry.label,
    hint: modelHint(source, account.instance, entry),
    icon: providerMark(source),
    disabled: transferDisabled || (source.id === choice?.provider && account.id === choice?.providerInstanceId && entry.id === model?.id),
    selected: Boolean(target && target.provider === source.id && target.providerInstanceId === account.id && target.model === entry.id),
    keepOpen: Boolean(tuning),
    onSelect: () => tuning ? setTarget({ provider: source.id, providerInstanceId: account.id, model: entry.id }) : onTransfer?.({ provider: source.id, providerInstanceId: account.id, model: entry.id }),
    action: {
      label: `Favorite ${entry.label}`,
      icon: <StarIcon size={14} />,
      pressed: favorites.some(favorite => favorite.provider === source.id && favorite.providerInstanceId === account.id && favorite.model === entry.id),
      onSelect: () => toggleFavoriteModel({ provider: source.id, providerInstanceId: account.id, model: entry.id }),
    },
  }))));
  const targetProvider = target && providers.find(entry => entry.id === target.provider);
  const targetModels = providerAccount(targetProvider, target?.providerInstanceId).models;
  const targetName = target && selectedModel(targetModels, target.model)?.label;
  const transferLabel = transferring && target ? `Transfer to ${targetName ?? target.model}` : "Transfer to another agent";
  const transferButton = onTransfer && <button
    className="model-picker-row model-picker-transfer"
    type="button"
    title={transferLabel}
    aria-pressed={transferring}
    data-ready={Boolean(transferring && target) || undefined}
    disabled={transferDisabled}
    onClick={() => {
      if (transferring && target) { onTransfer(target); return; }
      setTransferring(!transferring);
      setTarget(undefined);
      setBrowsing(choice?.provider);
    }}
  >
    {transferring && target ? <CheckIcon size={16} /> : <SwapIcon size={16} />}
    <span className="truncate">{!transferring ? "Transfer" : target ? "Confirm" : "Cancel"}</span>
  </button>;
  return <Menu
    width={MENU_WIDTH}
    gutter={tuning && !narrow ? TUNING_GUTTER : 0}
    className="model-picker-menu"
    searchable
    onClose={() => { setTransferring(false); setTarget(undefined); }}
    footer={tuning && <div className="model-picker-footer" inert={transferring && !target}>{tuning(transferring ? target : undefined)}</div>}
    clearOf={menuClearOf}
    sheet={narrow}
    emptyMessage={favoritesView ? "Star models to find them here." : undefined}
    controls={<>
      {onTransfer && transferring && <p className="model-picker-note" role="status">Choose a model for a new agent in this chat. Reading the conversation again uses extra usage.</p>}
      {catalog?.modelsError && <p className="model-picker-note" role="status">Models · refresh unavailable</p>}
    </>}
    aside={<nav className="model-picker-providers sliding-selection" aria-label={`${label} · Provider`}>
      <SelectionHighlight value={favoritesView ? "favorites" : catalog?.id} selector='.model-picker-provider[aria-pressed="true"]' />
      <button className="model-picker-row model-picker-provider model-picker-favorites" type="button" aria-pressed={favoritesView} onClick={() => setBrowsing("favorites")}>
        <StarIcon size={16} fill={favoritesView ? "currentColor" : "none"} />
        <span className="truncate">Favorites</span>
      </button>
      {columnProviders.map((entry) => <button key={entry.id} className="model-picker-row model-picker-provider" type="button" title={locked ? `${entry.label} · Provider locked` : entry.label} aria-pressed={!favoritesView && catalog?.id === entry.id} onClick={() => setBrowsing(entry.id)}>
        <ProviderIcon provider={entry.id} />
        <span className="truncate">{entry.label}</span>
        {locked && <LockIcon size={11} />}
      </button>)}
      {transferButton}
    </nav>}
    items={[
      ...(automatic && !favoritesView && !transferring ? [{ id: "conversation", label: automatic, selected: !value, onSelect: () => onChange(null) }] : []),
      ...(transferring ? transferItems : catalogs.flatMap(source => accounts(source, Boolean(locked)).flatMap(account => account.models.filter(entry => !favoritesView || favorites.some(favorite => favorite.provider === source.id && favorite.model === entry.id && favorite.providerInstanceId === account.id)).map(entry => ({
        id: `${source.id}:${account.id ?? "default"}:${entry.id}`,
        label: entry.label,
        hint: modelHint(source, account.instance, entry),
        icon: providerMark(source),
        selected: Boolean(value && source.id === choice?.provider && account.id === choice?.providerInstanceId && entry.id === model?.id),
        keepOpen: Boolean(tuning),
        onSelect: () => onChange({ provider: source.id, providerInstanceId: account.id, model: entry.id }),
        action: {
          label: `Favorite ${entry.label}`,
          icon: <StarIcon size={14} />,
          pressed: favorites.some(favorite => favorite.provider === source.id && favorite.model === entry.id && favorite.providerInstanceId === account.id),
          onSelect: () => toggleFavoriteModel({ provider: source.id, providerInstanceId: account.id, model: entry.id }),
        },
      }))))),
    ]}
    trigger={({ toggle, id, open }) => <button
      ref={buttonRef}
      id={id}
      type="button"
      className={className}
      aria-label={`${label}: ${name}`}
      aria-haspopup="menu"
      aria-expanded={open}
      disabled={disabled}
      onClick={() => { if (!open) { setBrowsing(choice?.provider); setTransferring(false); setTarget(undefined); if (connected) send({ t: "providers.refresh" }); } toggle(); }}
    >
      {choice && <ProviderIcon provider={choice.provider} />}
      <span className="truncate">{name}</span>
      {tunedEffort && <span className="model-picker-effort">{effortLabel(tunedEffort)}</span>}
      <ChevronDownIcon size={12} className="model-picker-chevron" />
    </button>}
  />;
}
