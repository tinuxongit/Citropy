import { useEffect, useMemo, useRef, useState } from "react";
import { BOT_TEMPLATES, botTemplate, type BotTemplate } from "../../../../shared/bot-templates.ts";
import { BOT_LIMITS, defaultLook, type Bot, type BotLook, type BotProfile } from "../../../../shared/bots.ts";
import { describeSchedule } from "../../../../shared/routines.ts";
import { botThreadSettings, closeNewBotChat, createBot, createGroup } from "../../lib/bots.ts";
import { entryText, orderedRoster, searchMatcher } from "../../lib/roster.ts";
import { selectRosterEntry, useApp } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { SearchIcon } from "../icons/actions.tsx";
import { ChevronDownIcon } from "../icons/chevrons.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { Menu } from "../Menu.tsx";
import { Modal } from "../Modal.tsx";
import { ModelPicker } from "../ModelPicker.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { BotConnections } from "./BotConnections.tsx";
import { BotLookPicker } from "./BotLookPicker.tsx";
import { BotProfileFields, type ProfileDraft } from "./BotProfileFields.tsx";

const ROW_AVATAR_SIZE = 32;
const IDENTITY_AVATAR_SIZE = 28;
const TEMPLATE_AVATAR_SIZE = 20;
const LOOK_MENU_WIDTH = 360;
const TEMPLATE_MENU_WIDTH = 300;
const EMPTY_PROFILE: ProfileDraft = { name: "", title: "", description: "" };
const DEFAULT_ACCESS: Pick<BotProfile, "notifications" | "connections"> = { notifications: true, connections: [] };

export function NewChatDialog() {
  const bots = useApp((state) => state.bots);
  const botGroups = useApp((state) => state.botGroups);
  const threads = useApp((state) => state.threads);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const firstBot = Object.keys(bots).length === 0;
  const [template, setTemplate] = useState(() => {
    const id = useApp.getState().newBotTemplate;
    return id ? botTemplate(id) : undefined;
  });
  const [making, setMaking] = useState(firstBot || Boolean(template));
  const [profile, setProfile] = useState<ProfileDraft>(() => template ? { name: template.name, title: template.title, description: template.description } : EMPTY_PROFILE);
  const [look, setLook] = useState<BotLook>(() => template?.look ?? defaultLook(Object.keys(bots).length));
  const [access, setAccess] = useState(DEFAULT_ACCESS);
  const [thread, setThread] = useState(botThreadSettings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fields = useRef<HTMLDivElement>(null);
  const roster = useMemo(() => {
    const { shown, hidden } = orderedRoster({ bots, botGroups, threads });
    const matches = searchMatcher(query);
    return [...shown, ...hidden].filter((entry): entry is { kind: "bot"; item: Bot } => entry.kind === "bot" && matches(entryText(entry)));
  }, [bots, botGroups, threads, query]);
  useEffect(() => {
    if (making) fields.current?.querySelector<HTMLInputElement>('[data-field="name"]')?.focus();
  }, [making]);

  const run = (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    work().then(closeNewBotChat, (failure: Error) => setError(failure.message)).finally(() => setBusy(false));
  };
  const startMaking = () => {
    setProfile({ ...EMPTY_PROFILE, name: query.trim() });
    setTemplate(undefined);
    setAccess(DEFAULT_ACCESS);
    setThread(botThreadSettings());
    setMaking(true);
  };
  const pickTemplate = (picked?: BotTemplate) => {
    setTemplate(picked);
    setProfile(picked ? { name: picked.name, title: picked.title, description: picked.description } : EMPTY_PROFILE);
    setLook(picked?.look ?? defaultLook(Object.keys(bots).length));
  };
  const toggle = (id: string) => setPicked((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]);
  const openPicked = () => {
    if (picked.length === 1) {
      selectRosterEntry(picked[0]!);
      closeNewBotChat();
    } else run(() => createGroup(picked));
  };
  const submit = () => {
    if (making) {
      if (profile.name.trim()) run(() => createBot({ ...profile, ...look, ...access }, template?.id, thread));
    } else if (picked.length) openPicked();
    else if (query.trim()) startMaking();
  };
  const full = picked.length >= BOT_LIMITS.groupMembersMax;
  const name = query.trim();

  return (
    <Modal
      title={making ? "Create bot" : "New chat"}
      description={making ? undefined : `Pick one bot to chat, or ${BOT_LIMITS.groupMembersMin} to ${BOT_LIMITS.groupMembersMax} for a group chat.`}
      className={`new-chat-dialog${making ? " new-bot-dialog" : ""}`}
      busy={busy}
      initialFocus=".new-chat-search input"
      actions={making && (
        <Menu
          align="end"
          width={TEMPLATE_MENU_WIDTH}
          header="Start from"
          items={[
            { id: "blank", label: "Blank", hint: "Start from scratch", icon: <span className="bot-template-blank" style={{ width: TEMPLATE_AVATAR_SIZE, height: TEMPLATE_AVATAR_SIZE }}><PlusIcon size={14} /></span>, selected: !template, onSelect: () => pickTemplate() },
            ...BOT_TEMPLATES.map((entry) => ({ id: entry.id, label: entry.name, hint: entry.title, icon: <BotAvatar bot={entry.look} size={TEMPLATE_AVATAR_SIZE} />, selected: template?.id === entry.id, onSelect: () => pickTemplate(entry) })),
          ]}
          trigger={({ toggle, id, open }) => (
            <button id={id} type="button" className="btn bot-template-trigger" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={toggle}>
              <span className="truncate">{template?.name ?? "Templates"}</span>
              <ChevronDownIcon size={12} />
            </button>
          )}
        />
      )}
      onClose={closeNewBotChat}
      onSubmit={submit}
      footer={making ? (
        <>
          <button className="btn" type="button" data-cancel disabled={busy} onClick={() => firstBot ? closeNewBotChat() : setMaking(false)}>{firstBot ? "Cancel" : "Back"}</button>
          <button className="btn" data-variant="primary" disabled={busy || !profile.name.trim()}>{busy && <Loader size={15} />}Create bot</button>
        </>
      ) : (
        <>
          {picked.length > 0 && <span className="new-chat-count">{picked.length} selected</span>}
          <button className="btn" type="button" data-cancel disabled={busy} onClick={closeNewBotChat}>Cancel</button>
          <button className="btn" data-variant="primary" disabled={busy || !picked.length}>
            {busy && <Loader size={15} />}{picked.length >= BOT_LIMITS.groupMembersMin ? "Start group chat" : "Open chat"}
          </button>
        </>
      )}
    >
      {making ? (
        <div ref={fields} className="new-bot-form">
          <div className="bot-identity">
            <Menu
              width={LOOK_MENU_WIDTH}
              className="bot-look-menu"
              items={[]}
              controls={<BotLookPicker look={look} onChange={(patch) => setLook({ ...look, ...patch })} />}
              trigger={({ toggle, id, open }) => (
                <button id={id} type="button" className="bot-identity-avatar" aria-label="Change look" title="Change look" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={toggle}>
                  <BotAvatar bot={look} size={IDENTITY_AVATAR_SIZE} />
                </button>
              )}
            />
            <BotProfileFields draft={profile} onChange={setProfile} only={["name"]} />
          </div>
          <BotProfileFields draft={profile} onChange={setProfile} only={["title"]} />
          <BotProfileFields draft={profile} onChange={setProfile} only={["description"]} descriptionBar={
            <div className="bot-brief-bar">
              <ModelPicker
                label="Model"
                className="composer-select composer-model"
                value={thread ? { provider: thread.provider, providerInstanceId: thread.providerInstanceId, model: thread.model ?? "default" } : null}
                disabled={busy || !thread}
                onChange={(choice) => { if (choice && thread) setThread({ permissionMode: thread.permissionMode, ...choice }); }}
                tune={{ settings: thread ?? {}, onChange: (patch) => setThread((current) => current && { ...current, ...patch }) }}
              />
            </div>
          } />
          {template && (
            <p className="bot-template-routine">
              Comes with the routine <strong>{template.routine.name}</strong>. {describeSchedule(template.routine.schedule)}.
            </p>
          )}
          <details className="bot-advanced">
            <summary>Advanced settings<ChevronDownIcon size={14} /></summary>
            <div className="bot-advanced-body">
              <label className="bot-notify">
                <span>
                  <strong>Notifications</strong>
                  <small>Get notified when this agent finishes or needs input</small>
                </span>
                <input className="setting-switch" type="checkbox" role="switch" checked={access.notifications} onChange={(event) => setAccess({ ...access, notifications: event.target.checked })} />
              </label>
              <BotConnections bot={{ name: profile.name.trim() || "This bot", connections: access.connections }} onChange={(patch) => setAccess({ ...access, ...patch })} />
            </div>
          </details>
        </div>
      ) : (
        <>
          <label className="thread-search new-chat-search">
            <SearchIcon size={16} />
            <input aria-label="Find or name a bot" placeholder="Search or name a new bot" value={query} onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || picked.length) return;
                event.preventDefault();
                submit();
              }} />
          </label>
          <div className="new-chat-list" role="group" aria-label="Bots">
            <button type="button" className="new-chat-row new-chat-make-row" onClick={startMaking}>
              <span className="new-chat-plus"><PlusIcon size={16} /></span>
              <span className="new-chat-row-name truncate">{name ? `Create "${name}" bot` : "Create new bot"}</span>
            </button>
            {roster.map(({ item: bot }) => {
              const checked = picked.includes(bot.id);
              return (
                <label key={bot.id} className="new-chat-row" data-checked={checked || undefined}>
                  <BotAvatar bot={bot} size={ROW_AVATAR_SIZE} />
                  <span className="new-chat-row-text">
                    <span className="new-chat-row-name truncate">{bot.name}</span>
                    {bot.title && <small className="truncate">{bot.title}</small>}
                  </span>
                  <input type="checkbox" checked={checked} disabled={!checked && full} onChange={() => toggle(bot.id)} />
                </label>
              );
            })}
            {!roster.length && query && <p className="new-chat-empty">No bots match. Create one with this name above.</p>}
          </div>
        </>
      )}
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
    </Modal>
  );
}
