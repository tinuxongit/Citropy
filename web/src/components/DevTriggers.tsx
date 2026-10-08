import { CircleCheckIcon, CircleXIcon, ClockIcon, HourglassIcon, InfoIcon, ShieldHelpIcon, WarningIcon } from "./icons/status.tsx";
import { FlaskIcon } from "./icons/objects.tsx";
import { BranchIcon, MergeIcon } from "./icons/git.tsx";
import { BellIcon } from "./BellIcon.tsx";
import { UpdateIcon } from "./UpdateIcon.tsx";
import { QuestionMessageIcon } from "./icons/messages.tsx";
import { SparkleIcon } from "./SparkleIcon.tsx";
import { TerminalIcon } from "./icons/squares.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { Menu } from "./Menu.tsx";
import { clearFakes, FAKE_NOTIFICATIONS, fakeChatError, fakeGitChanges, fakeNotification, fakeNotificationBurst, fakePermission, fakeQuestion, fakeQueued, fakeShell, fakeToast, fakeUsageLimit, fakeWhatsNew, needsThread } from "../lib/dev-triggers.ts";
import { reportError } from "../lib/api.ts";
import { send } from "../lib/socket.ts";
import { useApp } from "../lib/store.ts";

export function DevTriggers() {
  const development = useApp((state) => state.development);
  const hasThread = useApp((state) => Boolean(state.threads[state.activeThreadId ?? ""]));
  const usingAppData = useApp((state) => state.usingAppData);
  if (!development) return null;
  const { finished, failed, merged, update } = FAKE_NOTIFICATIONS;
  const items = [
    { id: "question", section: "Conversation", label: "Question", hint: "Two questions in the composer", icon: <QuestionMessageIcon size={16} />, onSelect: fakeQuestion, thread: true },
    { id: "permission", section: "Conversation", label: "Permission", hint: "A command waiting for approval", icon: <ShieldHelpIcon size={16} />, onSelect: fakePermission, thread: true },
    { id: "queued", section: "Conversation", label: "Queued messages", hint: "Two messages waiting in the queue", icon: <ClockIcon size={16} />, onSelect: fakeQueued, thread: true },
    { id: "usage-limit", section: "Conversation", label: "Usage limit", hint: "Chat stopped until usage resets", icon: <HourglassIcon size={16} />, onSelect: fakeUsageLimit, thread: true },
    { id: "chat-error", section: "Conversation", label: "Chat error", hint: "The provider failed the last turn", icon: <WarningIcon size={16} />, onSelect: fakeChatError, thread: true },
    { id: "shell", section: "Conversation", label: "Running shell", hint: "Adds to the shells tab", icon: <TerminalIcon size={16} />, onSelect: fakeShell, thread: true },
    { id: "git", section: "Conversation", label: "Git changes", hint: "Three changed files on the git tab", icon: <BranchIcon size={16} />, onSelect: fakeGitChanges, thread: true },
    { id: "notify-finished", section: "Notifications", label: "Task finished", hint: "Success that opens this chat", icon: <CircleCheckIcon size={16} />, onSelect: () => fakeNotification(finished), thread: needsThread(finished) },
    { id: "notify-failed", section: "Notifications", label: "Push failed", hint: "Error that opens source control", icon: <CircleXIcon size={16} />, onSelect: () => fakeNotification(failed), thread: needsThread(failed) },
    { id: "notify-merged", section: "Notifications", label: "Pull request merged", hint: "Success that opens GitHub", icon: <MergeIcon size={16} />, onSelect: () => fakeNotification(merged), thread: needsThread(merged) },
    { id: "notify-update", section: "Notifications", label: "Update ready", hint: "Info that opens settings", icon: <UpdateIcon size={16} />, onSelect: () => fakeNotification(update), thread: needsThread(update) },
    { id: "notify-burst", section: "Notifications", label: "All at once", hint: "Every notification above, stacked", icon: <BellIcon size={16} />, onSelect: fakeNotificationBurst, thread: Object.values(FAKE_NOTIFICATIONS).some(needsThread) },
    { id: "toast", section: "Notifications", label: "Plain toast", hint: "One line, no title or action", icon: <InfoIcon size={16} />, onSelect: fakeToast, thread: false },
    { id: "whats-new", section: "App", label: "What's new", hint: "Release notes shown after an update", icon: <SparkleIcon size={16} />, onSelect: () => { fakeWhatsNew().catch(reportError); }, thread: false },
    { id: "clear", section: "App", label: "Clear fakes", hint: "Git refreshes on its own", icon: <TrashIcon size={16} />, onSelect: clearFakes, thread: false },
  ].map(({ thread, ...item }) => ({ ...item, disabled: thread && !hasThread }));
  return (
    <>
      <span className="dev-mark" aria-hidden="true">{usingAppData ? "dev, app chats" : "dev"}</span>
      <div className="dev-triggers">
        <Menu
          header="Trigger a fake"
          align="end"
          width={280}
          items={items}
          footer={
            <label className="dev-data-toggle">
              <span>
                <strong>App chats</strong>
                <small>Load the regular app's chats. Restarts the server.</small>
              </span>
              <input className="setting-switch" type="checkbox" role="switch" checked={usingAppData}
                onChange={(event) => send({ t: "server.useAppData", enabled: event.target.checked })} />
            </label>
          }
          trigger={({ id, open, toggle }) => (
            <button id={id} type="button" className="dev-triggers-button" aria-label="Development triggers" title="Development triggers" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
              <FlaskIcon size={15} />
            </button>
          )}
        />
      </div>
    </>
  );
}
