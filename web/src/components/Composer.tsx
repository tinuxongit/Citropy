import { QuestionForm } from "./QuestionPanel.tsx";
import { AnimatePresence, motion } from "motion/react";
import { PermissionRow } from "./PermissionPanel.tsx";
import { UsageLimitTab } from "./UsageLimitNotice.tsx";
import { environmentId, environmentSignal } from "../lib/environment.ts";
import { ComposerInput } from "./ComposerInput.tsx";
import { gitActionBusy } from "../../../shared/assistance.ts";
import { Attachments } from "./Attachments.tsx";
import { QueueList } from "./QueueList.tsx";
import { api, reportError } from "../lib/api.ts";
import type { QueuedMessage } from "../../../shared/protocol.ts";
import type { WritingModel } from "../../../shared/assistance.ts";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Square } from "./icons.ts";
import { Paperclip, CheckCircle2 } from "lucide-react";
import { nextTurnSettings, selectedModel } from "../../../shared/model-options.ts";
import { providerAccount } from "../../../shared/provider-account.ts";
import { ContextUsage } from "./ContextUsage.tsx";
import {
  configureThread,
  sendMessage,
  stopThread,
  loadThread,
  finishThread,
} from "../lib/actions.ts";
import { confirmAction, selectThread, useApp } from "../lib/store.ts";
import { playUiSound } from "../lib/ui-sound.ts";
import { useReducedMotion } from "../lib/use-reduced-motion.ts";
import { Select } from "./Select.tsx";
import { ModelPicker } from "./ModelPicker.tsx";
import { Loader } from "./Loader.tsx";
import {
  ContextMenu,
  EffortMenu,
  ModelTuning,
  PermissionMenu,
  type TuningSettings,
} from "./composer/ComposerOptions.tsx";
import { useComposerDraft } from "./composer/use-composer-draft.ts";
import { threadStarted } from "../lib/thread-started.ts";
import { onComposerDelivery, takeComposerDeliveries, type ComposerDelivery } from "../lib/composer-inbox.ts";
import { useAttachmentUpload } from "./composer/use-attachment-upload.ts";
import { useComposerCommands } from "./composer/use-composer-commands.tsx";
import { ComposerFrame } from "./composer/ComposerFrame.tsx";
import { PlanTab } from "./composer/PlanTab.tsx";

const START_QUESTION = "What's next";

export function Composer({
  onUsage,
  onSkills,
}: {
  onUsage?: () => void;
  onSkills?: () => void;
}) {
  const [scope] = useState(environmentId);
  const [scopeSignal] = useState(environmentSignal);
  const threadId = useApp((state) => state.activeThreadId);
  const thread = useApp((state) =>
    threadId ? state.threads[threadId] : undefined,
  );
  const connected = useApp((state) => state.connected);
  const providers = useApp((state) => state.providers);
  const projectName = useApp((state) => state.projects.find((entry) => entry.id === thread?.projectId)?.name);
  const hasMessages = useApp((state) => Boolean(threadId && state.order[threadId]?.length));
  const loaded = useApp((state) => Boolean(threadId && state.loaded[threadId]));
  const { value, setValue, attachments, setAttachments, clearDraft } = useComposerDraft(threadId, scope);
  const { uploading, upload } = useAttachmentUpload({
    threadId,
    scopeSignal,
    attachmentCount: attachments.length,
    onUploaded: (attachment) =>
      setAttachments((previous) => [...previous, attachment]),
  });
  const [sending, setSending] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const modelButton = useRef<HTMLButtonElement>(null);
  const effortButton = useRef<HTMLButtonElement>(null);
  const permissionButton = useRef<HTMLButtonElement>(null);
  // Stable so the memoized ContextUsage only re-renders when the draft or thread changes.
  const compact = useCallback(() => {
    if (threadId)
      void api(`threads/compact?threadId=${threadId}`, {
        method: "POST",
      }).catch(reportError);
  }, [threadId]);
  const [transferSettings, setTransferSettings] = useState<{ key: string; settings: TuningSettings }>({ key: "", settings: {} });
  const transferKey = (choice: WritingModel) => `${choice.provider}:${choice.providerInstanceId ?? ""}:${choice.model}`;
  const settingsFor = (choice: WritingModel) => transferSettings.key === transferKey(choice) ? transferSettings.settings : {};
  const modelFor = (choice: WritingModel) => {
    const target = providers.find((entry) => entry.id === choice.provider);
    return selectedModel(providerAccount(target, choice.providerInstanceId).models, choice.model);
  };
  const transfer = async (choice: WritingModel) => {
    if (!thread || transferring) return;
    const target = providers.find((entry) => entry.id === choice.provider);
    const { instance } = providerAccount(target, choice.providerInstanceId);
    const name = modelFor(choice)?.label ?? choice.model;
    if (!await confirmAction({
      title: `Transfer to ${name}?`,
      description: "A new agent reads the conversation and continues here. This uses extra usage on the selected provider and may cost more. Your chat history, workspace and draft stay in place.",
      context: instance ? `${target?.label} · ${instance.name}` : target?.label,
      label: "Transfer and continue",
    }) || scopeSignal.aborted || !useApp.getState().connected) return;
    setTransferring(true);
    try {
      await api(`threads/transfer?threadId=${thread.id}`, { method: "POST", body: JSON.stringify({ ...choice, ...settingsFor(choice) }) });
    } catch (error) { reportError(error); }
    finally { if (!scopeSignal.aborted) setTransferring(false); }
  };
  const place = useCallback(({ text, attachments = [], placement }: Pick<QueuedMessage, "text" | "attachments"> & Pick<ComposerDelivery, "placement">) => {
    const before = placement === "before";
    if (text) setValue((previous) =>
      !previous.trim() ? text : before ? `${text}\n\n${previous}` : `${previous.trimEnd()}\n\n${text}`,
    );
    setAttachments((previous) => before ? [...attachments, ...previous] : [...previous, ...attachments]);
  }, [setValue, setAttachments]);
  const restore = useCallback((item: QueuedMessage) => place({ ...item, placement: "before" }), [place]);
  useEffect(() => {
    if (!threadId) return;
    const receive = () => {
      for (const delivery of takeComposerDeliveries(threadId)) place(delivery);
    };
    receive();
    return onComposerDelivery(receive);
  }, [threadId, place]);

  const running = thread?.running ?? false;
  const provider = providers.find((entry) => entry.id === thread?.provider);
  const { instance, models, usable } = providerAccount(provider, thread?.providerInstanceId);
  const canSend =
    !sending &&
    !transferring &&
    !thread?.compacting &&
    !gitActionBusy(thread?.gitAction) &&
    !uploading &&
    usable;
  const configuredThread = useMemo(() => thread ? { ...thread, ...nextTurnSettings(thread) } : undefined, [thread]);
  const model = selectedModel(models, configuredThread?.model);
  const commands = useComposerCommands({
    thread: configuredThread,
    provider,
    model,
    onCompact: compact,
    onUsage,
    onSkills,
    modelButton,
    effortButton,
    permissionButton,
  });

  const started = thread ? threadStarted(thread, hasMessages, loaded) : hasMessages;
  const starting = !started && !running && !thread?.parentThreadId;
  const composerRef = useRef<HTMLDivElement>(null);
  const startTop = useRef<number>(undefined);
  const reducedMotion = useReducedMotion();
  useLayoutEffect(() => {
    const element = composerRef.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top;
    if (starting) { startTop.current = top; return; }
    if (startTop.current === undefined) return;
    const distance = startTop.current - top;
    startTop.current = undefined;
    if (reducedMotion || Math.abs(distance) < 1) return;
    element.animate([{ transform: `translateY(${distance}px)` }, { transform: "none" }], { duration: 320, easing: "cubic-bezier(0.65, 0, 0.35, 1)" });
  }, [starting, reducedMotion]);

  const tabs = useMemo(() => thread && <>
    <ComposerRequest />
    <UsageLimitTab threadId={thread.id} />
    <PlanTab threadId={thread.id} />
    <QueueList thread={thread} provider={provider} onEdit={restore} />
  </>, [thread, provider, restore]);
  const settingsBar = useMemo(() => thread && <>
    <ModelPicker
      value={{ provider: thread.provider, providerInstanceId: thread.providerInstanceId, model: configuredThread?.model ?? model?.id ?? "default" }}
      label="Model"
      buttonRef={modelButton}
      className="composer-select composer-model"
      disabled={!connected || sending || transferring}
      lockedProvider={running || hasMessages || thread.externalId || thread.usage.turns || thread.queue?.length ? thread.provider : undefined}
      instanceId={thread.providerInstanceId}
      onTransfer={thread.parentThreadId ? undefined : (choice) => void transfer(choice)}
      transferDisabled={Boolean(!hasMessages || running || thread.queue?.length || thread.compacting || gitActionBusy(thread.gitAction))}
      onChange={(choice) => { if (choice) configureThread(thread.id, { ...choice, providerInstanceId: choice.providerInstanceId ?? null, effort: null }); }}
      menuClearOf=".composer-shell"
      tuning={(target) => target && <ModelTuning key={transferKey(target)} settings={settingsFor(target)} model={modelFor(target)} onChange={(patch) => setTransferSettings({ key: transferKey(target), settings: { ...settingsFor(target), ...patch } })} />}
    />

    <ContextMenu thread={configuredThread!} model={model} disabled={!connected || sending || transferring} />

    <EffortMenu thread={configuredThread!} model={model} disabled={!connected || sending || transferring} buttonRef={effortButton} />

    {provider?.instances?.length ? <Select className="composer-select composer-account" aria-label="Account" title="Account" value={thread.providerInstanceId ?? ""} disabled={!connected || sending || transferring || running || hasMessages || Boolean(thread.externalId || thread.parentThreadId || thread.queue?.length)} onChange={value => void configureThread(thread.id, { providerInstanceId: value || null })}
      options={[
        ...provider.available ? [{ value: "", label: "Default" }] : [],
        ...provider.instances.map(entry => ({ value: entry.id, label: entry.name, disabled: !entry.available })),
      ]} /> : null}

    <PermissionMenu
      thread={configuredThread!}
      disabled={!connected || sending || transferring}
      buttonRef={permissionButton}
    />
  </>, [thread, configuredThread, model, provider, providers, connected, sending, transferring, running, hasMessages, transferSettings, scopeSignal]);

  const submit = async () => {
    const text = value.trim();
    if ((!text && !attachments.length) || !threadId || !canSend) return;
    playUiSound("send");
    const command = commands.find((entry) => entry.label === text);
    if (command) {
      if (running && command.idleOnly) return;
      command.run();
      setValue("");
      return;
    }
    setSending(true);
    try {
      await sendMessage(text, attachments);
      clearDraft();
    } catch (error) {
      reportError(error);
    } finally {
      setSending(false);
    }
  };

  if (!thread) return null;
  if (thread.nativeAgentId && thread.parentThreadId)
    return (
      <div className="composer">
        <div className="subagent-managed">
          This subagent is managed by its parent conversation.
          <button
            type="button"
            className="btn"
            onClick={() => {
              selectThread(thread.parentThreadId!);
              loadThread(thread.parentThreadId!);
            }}
          >{" "}Back to parent chat{" "}</button>
        </div>
      </div>
    );

  return (
    <div className="composer" ref={composerRef} data-start={starting || undefined}>
      {starting && <h1 className="composer-start-heading truncate">{projectName ? `${START_QUESTION} for ${projectName}?` : `${START_QUESTION}?`}</h1>}
      {thread.parentThreadId && (
        <div className="subagent-managed">
          Subagent conversation
          <button
            type="button"
            onClick={() => {
              selectThread(thread.parentThreadId!);
              loadThread(thread.parentThreadId!);
            }}
          >
            Back to parent chat
          </button>
        </div>
      )}
      {provider && !provider.enabled && (
        <div className="models-warning" role="status">
          {`${provider.label} is disabled. Enable it in Settings > Providers to continue this conversation.`}
        </div>
      )}
      {(instance?.modelsError ?? provider?.modelsError) && (
        <div className="models-warning" role="status">
          {instance?.modelsError ?? provider?.modelsError}
        </div>
      )}
      <div className="composer-column">
      <div
        className="composer-shell"
        data-dragging={dragging}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) {
            event.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(Array.from(event.dataTransfer.files));
        }}
      >
        <ComposerFrame />
        <motion.div className="composer-tabs" layout layoutRoot>
          {tabs}
        </motion.div>
        <div className="composer-dock">
          {thread.finished && !running && (
            <div className="composer-finished" role="status">
              <CheckCircle2 size={14} aria-hidden="true" />
              <div className="composer-finished-copy">
                <strong>Conversation finished</strong>
                <span>Send a message to reopen it.</span>
              </div>
              <button
                className="btn"
                data-variant="ghost"
                type="button"
                disabled={!connected}
                onClick={() => finishThread(thread.id, false)}
              >
                Reopen
              </button>
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={(event) => {
            void upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
        {attachments.length > 0 && (
          <Attachments
            files={attachments}
            projectId={thread.projectId}
            threadId={thread.id}
            onRemove={(id) => {
              setAttachments((previous) =>
                previous.filter((file) => file.id !== id),
              );
              void api(`attachments?threadId=${thread.id}&id=${id}`, {
                method: "DELETE",
              }).catch(reportError);
            }}
          />
        )}
        {uploading && (
          <div className="upload-progress" role="status">
            <Loader size={15} />
            Uploading {uploading}…
          </div>
        )}
        <div className="composer-row">
        <ComposerInput
          value={value}
          onChange={setValue}
          onSubmit={submit}
          onFiles={(files) => void upload(files)}
          disabled={sending}
          thread={thread}
          commands={commands}
        />
          <div className="composer-actions">
            <ContextUsage onCompact={compact} draft={value} />
            <button
              className="icon-btn"
              type="button"
              title="Attach images or files"
              aria-label="Attach images or files"
              disabled={!connected || Boolean(uploading)}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={17} />
            </button>

            {running ? (
              <>
                <button
                  className="btn"
                  type="button"
                  data-variant="primary"
                  data-ui-sound="off"
                  onClick={submit}
                  disabled={(!value.trim() && !attachments.length) || !canSend}
                >
                  <ArrowUp size={13} />
                  Queue
                </button>
                <button
                  className="btn composer-stop"
                  type="button"
                  data-variant="danger"
                  aria-label="Stop"
                  title="Stop"
                  onClick={stopThread}
                >
                  <Square size={11} fill="currentColor" aria-hidden="true" />
                </button>
              </>
            ) : (
              <button
                className="btn composer-send"
                type="button"
                data-variant="primary"
                data-ui-sound="off"
                aria-label="Send"
                title="Send"
                onClick={submit}
                disabled={(!value.trim() && !attachments.length) || !canSend}
              >
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="composer-bar">{settingsBar}</div>
      </div>
    </div>
  );
}

function ComposerRequest() {
  const question = useApp((state) => state.questions.find((request) => request.threadId === state.activeThreadId));
  const permission = useApp((state) => state.permissions[0]);
  const permissionFirst = permission && (!question || permission.createdAt < question.createdAt);
  return <AnimatePresence mode="wait">
    {permissionFirst ? <PermissionRow key={permission.id} request={permission} /> : question && <QuestionForm key={question.id} request={question} />}
  </AnimatePresence>;
}
