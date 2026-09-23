import { useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import { useI18n } from "../../lib/i18n.ts";
import { useGitHub } from "../../lib/use-github.ts";
import { github } from "../../lib/actions.ts";
import {
  GitHubFeedback,
  GitHubLink,
  GitHubPagination,
  githubDate,
} from "./GitHubShared.tsx";

export function GitHubNotifications({ onSelect }: { onSelect: (repo: string) => void }) {
  const t = useI18n();
  const [page, setPage] = useState(1);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const list = useGitHub("notifications", { page, all });
  return (
    <div className="github-workspace scroll">
      <div className="github-toolbar">
        <label className="github-checkbox">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => {
              setAll(event.target.checked);
              setPage(1);
            }}
          />{" "}{t("Include read notifications")}{" "}</label>
        <button
          className="icon-btn"
          aria-label={t("Refresh notifications")}
          disabled={list.loading}
          onClick={list.refresh}
        >
          <RefreshCw size={16} />
        </button>
      </div>
      <GitHubFeedback
        error={error || list.error}
        loading={list.loading && !list.data}
        empty={
          list.data?.items.length === 0 ? "You’re all caught up" : undefined
        }
      />
      <div className="github-notifications">
        {list.data?.items.map((notification) => (
          <article key={notification.id} data-unread={notification.unread}>
            <Bell size={17} />
            <div>
              <strong>{notification.subject.title}</strong>
              <p className="github-meta">
                <button
                  onClick={() => onSelect(notification.repository.full_name)}
                >
                  {notification.repository.full_name}
                </button>{" "}
                · {notification.reason.replaceAll("_", " ")} ·{" "}
                {githubDate(notification.updated_at)}
              </p>
            </div>
            <GitHubLink
              href={`https://github.com/notifications?query=repo%3A${encodeURIComponent(notification.repository.full_name)}`}
            >{" "}{t("Open")}{" "}</GitHubLink>
            {notification.unread && (
              <button
                className="icon-btn"
                disabled={Boolean(busy)}
                title={t("Mark as read")}
                aria-label={t("Mark {title} as read", { title: notification.subject.title })}
                onClick={async () => {
                  setBusy(notification.id);
                  setError("");
                  try {
                    await github("mutate", {
                      repo: notification.repository.full_name,
                      mutation: { action: "markRead", id: notification.id },
                    });
                    list.refresh();
                  } catch (failure) {
                    setError((failure as Error).message);
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Check size={16} />
              </button>
            )}
          </article>
        ))}
      </div>
      {list.data && (
        <GitHubPagination
          page={page}
          more={list.data.more}
          onChange={setPage}
        />
      )}
    </div>
  );
}
