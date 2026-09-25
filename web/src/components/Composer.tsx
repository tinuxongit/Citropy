import { environmentId, environmentSignal } from "../lib/environment.ts";
import { ComposerInput } from "./ComposerInput.tsx";
import { gitActionBusy } from "../../../shared/assistance.ts";
import { Attachments } from "./Attachments.tsx";
import { QueueList } from "./QueueList.tsx";
import { api, reportError } from "../lib/api.ts";
import type { QueuedMessage } from "../../../shared/protocol.ts";
import type { WritingModel } from "../../../shared/assistance.ts";
import { useCallback, useRef, useState } from "react";
import { ArrowUp, Square } from "./icons.ts";
import { Paperclip, CheckCircle2 } from "lucide-react";
import { nextTurnSettings, selectedModel } from "../../../shared/model-options.ts";
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
import { useI18n } from "../lib/i18n.ts";
import { ModelPicker } from "./ModelPicker.tsx";
import { PixelLoader } from "./PixelLoader.tsx";
import {
  ModelOptionsMenu,
  PermissionMenu,
  hasModelOptions,
} from "./composer/ComposerOptions.tsx";
import { useComposerDraft } from "./composer/use-composer-draft.ts";
import { useAttachmentUpload } from "./composer/use-attachment-upload.ts";
import { useComposerCommands } from "./composer/use-composer-commands.tsx";

export function Composer({
  onUsage,
  onSkills,
}: {
  onUsage?: () => void;
  onSkills?: () => void;
}) {
  const t = useI18n();
  const [scope] = useState(environmentId);
  const [scopeSignal] = useState(environmentSignal);
  const threadId = useApp((state) => state.activeThreadId);
  const thread = useApp((state) =>
    threadId ? state.threads[threadId] : undefined,
  );
  const connected = useApp((state) => state.connected);
  const providers = useApp((state) => state.providers);
  const hasMessages = useApp((state) => Boolean(threadId && state.order[threadId]?.length));
  const { value, setValue, attachments, setAttachments } = useComposerDraft(threadId, scope);
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
  const transfer = async (choice: WritingModel) => {
    if (!thread || transferring) return;
    const target = providers.find((entry) => entry.id === choice.provider);
    const account = target?.instances?.find(entry => entry.id === choice.providerInstanceId);
    const name = selectedModel(account?.models ?? target?.models ?? [], choice.model)?.label ?? choice.model;
    if (!await confirmAction({
      title: t("Transfer to {model}?", { model: name }),
      description: t("A new agent will read the conversation and continue here. This consumes extra usage on the selected provider, and may incur additional costs. Your chat history, workspace and draft stay in place."),
      context: account ? `${target?.label} · ${account.name}` : target?.label,
      label: t("Transfer and continue"),
    }) || scopeSignal.aborted || !useApp.getState().connected) return;
    setTransferring(true);
    try {
      await api(`threads/transfer?threadId=${thread.id}`, { method: "POST", body: JSON.stringify(choice) });
    } catch (error) { reportError(error); }
    finally { if (!scopeSignal.aborted) setTransferring(false); }
  };
  const restore = (item: QueuedMessage) => {
    setValue((previous) =>
      previous.trim() ? `${item.text}\n\n${previous}` : item.text,
    );
    setAttachments((previous) => [...(item.attachments ?? []), ...previous]);
  };

  const running = thread?.running ?? false;
  const provider = providers.find((entry) => entry.id === thread?.provider);
  const instance = thread?.providerInstanceId ? provider?.instances?.find(entry => entry.id === thread.providerInstanceId) : undefined;
  const models = thread?.providerInstanceId ? instance?.models ?? [] : provider?.models ?? [];
  const canSend =
    !sending &&
    !transferring &&
    !thread?.compacting &&
    !gitActionBusy(thread?.gitAction) &&
    !uploading &&
    Boolean(provider?.enabled && (thread?.providerInstanceId ? instance?.available : provider.available));
  const configuredThread = thread ? { ...thread, ...nextTurnSettings(thread) } : undefined;
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
      setAttachments([]);
      setValue("");
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
          {t("This subagent is managed by its parent conversation.")}
          <button
            type="button"
            className="btn"
            onClick={() => {
              selectThread(thread.parentThreadId!);
              loadThread(thread.parentThreadId!);
            }}
          >{" "}{t("Back to parent chat")}{" "}</button>
        </div>
      </div>
    );

  return (
    <div className="composer">
      {thread.parentThreadId && (
        <div className="subagent-managed">
          {t("Subagent conversation")}
          <button
            type="button"
            onClick={() => {
              selectThread(thread.parentThreadId!);
              loadThread(thread.parentThreadId!);
            }}
          >
            {t("Back to parent chat")}
          </button>
        </div>
      )}
      {provider && !provider.enabled && (
        <div className="models-warning" role="status">
          {t("{provider} is disabled. Enable it in Settings > Providers to continue this conversation.", { provider: provider.label })}
        </div>
      )}
      {(instance?.modelsError ?? provider?.modelsError) && (
        <div className="models-warning" role="status">
          {instance?.modelsError ?? provider?.modelsError}
        </div>
      )}
      <QueueList thread={thread} provider={provider} onEdit={restore} />
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
        <span className="composer-focus-ring" aria-hidden="true" />
        {thread.finished && !running && (
          <div className="composer-finished" role="status">
            <CheckCircle2 size={14} aria-hidden="true" />
            <div className="composer-finished-copy">
              <strong>{t("Conversation finished")}</strong>
              <span>{t("Send a message to reopen it.")}</span>
            </div>
            <button
              className="btn"
              data-variant="ghost"
              type="button"
              disabled={!connected}
              onClick={() => finishThread(thread.id, false)}
            >
              {t("Reopen")}
            </button>
          </div>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          aria-label={t("Attach files")}
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
            <PixelLoader size={15} />
            {t("Uploading {name}…", { name: uploading })}
          </div>
        )}
        <ComposerInput
          value={value}
          onChange={setValue}
          onSubmit={submit}
          onFiles={(files) => void upload(files)}
          disabled={sending}
          thread={thread}
          commands={commands}
        />
        {thread.pendingConfig && <div className="composer-pending-settings" role="status">{t("Applies to the next turn")}</div>}
        <div className="composer-bar">
          <ModelPicker
            value={{ provider: thread.provider, providerInstanceId: thread.providerInstanceId, model: configuredThread?.model ?? model?.id ?? "default" }}
            label={t("Model")}
            buttonRef={modelButton}
            className="composer-select composer-model"
            disabled={!connected || sending || transferring}
            lockedProvider={running || hasMessages || thread.externalId || thread.usage.turns || thread.queue?.length ? thread.provider : undefined}
            instanceId={thread.providerInstanceId}
            onTransfer={hasMessages && !thread.parentThreadId ? (choice) => void transfer(choice) : undefined}
            transferDisabled={Boolean(running || thread.queue?.length || thread.compacting || gitActionBusy(thread.gitAction))}
            onChange={(choice) => { if (choice) configureThread(thread.id, { ...choice, providerInstanceId: choice.providerInstanceId ?? null, effort: null }); }}
          />

          {provider?.instances?.length ? <select className="composer-select composer-account" aria-label={t("Account")} title={t("Account")} value={thread.providerInstanceId ?? ""} disabled={!connected || sending || transferring || running || hasMessages || Boolean(thread.externalId || thread.parentThreadId || thread.queue?.length)} onChange={event => void configureThread(thread.id, { providerInstanceId: event.target.value || null })}>
            {provider.available && <option value="">{t("Default")}</option>}
            {provider.instances.map(entry => <option key={entry.id} value={entry.id} disabled={!entry.available}>{entry.name}</option>)}
          </select> : null}

          {hasModelOptions(model) && (
            <ModelOptionsMenu
              thread={configuredThread!}
              model={model}
              disabled={!connected || sending || transferring}
              buttonRef={effortButton}
            />
          )}

          <PermissionMenu
            thread={configuredThread!}
            disabled={!connected || sending || transferring}
            buttonRef={permissionButton}
          />

          <div className="composer-actions">
            <ContextUsage onCompact={compact} draft={value} />
            <button
              className="icon-btn"
              type="button"
              title={t("Attach images or files")}
              aria-label={t("Attach images or files")}
              disabled={!connected || Boolean(uploading)}
              onClick={() => fileInput.current?.click()}
            >
              <Paperclip size={17} className="attachment-file-icon" />
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
                  {t("Queue")}
                </button>
                <button
                  className="btn composer-stop"
                  type="button"
                  data-variant="danger"
                  aria-label={t("Stop")}
                  title={t("Stop")}
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
                aria-label={t("Send")}
                title={t("Send")}
                onClick={submit}
                disabled={(!value.trim() && !attachments.length) || !canSend}
              >
                <ArrowUp size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
