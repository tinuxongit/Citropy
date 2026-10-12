import { useEffect, useMemo, useRef, useState } from "react";
import type { BotTemplate } from "../../../../shared/bot-templates.ts";
import { BOT_LIMITS, defaultLook, type Bot, type BotLook } from "../../../../shared/bots.ts";
import { closeNewBotChat, createBot, createGroup } from "../../lib/bots.ts";
import { entryText, orderedRoster, searchMatcher } from "../../lib/roster.ts";
import { selectRosterEntry, useApp } from "../../lib/store.ts";
import { ActionError } from "../ActionError.tsx";
import { SearchIcon } from "../icons/actions.tsx";
import { PlusIcon } from "../icons/marks.tsx";
import { Loader } from "../Loader.tsx";
import { Modal } from "../Modal.tsx";
import { BotAvatar } from "./BotAvatar.tsx";
import { BotLookPicker } from "./BotLookPicker.tsx";
import { BotProfileFields, type ProfileDraft } from "./BotProfileFields.tsx";
import { BotTemplatePicker } from "./BotTemplatePicker.tsx";

const ROW_AVATAR_SIZE = 32;
const EMPTY_PROFILE: ProfileDraft = { name: "", title: "", description: "" };

export function NewChatDialog() {
  const bots = useApp((state) => state.bots);
  const botGroups = useApp((state) => state.botGroups);
  const threads = useApp((state) => state.threads);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const firstBot = Object.keys(bots).length === 0;
  const [making, setMaking] = useState(firstBot);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [look, setLook] = useState<BotLook>(() => defaultLook(Object.keys(bots).length));
  const [template, setTemplate] = useState<BotTemplate>();
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
      if (profile.name.trim()) run(() => createBot({ ...profile, ...look }, template?.id));
    } else if (picked.length) openPicked();
    else if (query.trim()) startMaking();
  };
  const full = picked.length >= BOT_LIMITS.groupMembersMax;
  const name = query.trim();

  return (
    <Modal
      title={making ? "Create bot" : "New chat"}
      description={making ? "Start from a template or pick a look and tell it what it's for." : `Pick one bot to chat, or ${BOT_LIMITS.groupMembersMin} to ${BOT_LIMITS.groupMembersMax} for a group chat.`}
      className="new-chat-dialog"
      busy={busy}
      initialFocus=".new-chat-search input"
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
        <div ref={fields} className="new-chat-make">
          <BotTemplatePicker picked={template} onPick={pickTemplate} />
          <BotLookPicker look={look} onChange={(patch) => setLook({ ...look, ...patch })} />
          <BotProfileFields draft={profile} onChange={setProfile} />
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
