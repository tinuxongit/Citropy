import { Check, Github, RefreshCw } from "lucide-react";
import { useI18n } from "../../lib/i18n.ts";
import { github } from "../../lib/actions.ts";
import { GitHubLink } from "./GitHubShared.tsx";
import type { GitHubStatus, GitHubUser } from "../../../../shared/github.ts";

export function GitHubSignIn({
  status,
  onMessage,
  onRefresh,
}: {
  status: GitHubStatus;
  onMessage: (message: string) => void;
  onRefresh: () => void;
}) {
  const t = useI18n();
  return (
    <div className="github-connect">
      <Github size={38} />
      <h2>
        {status.installed
          ? t("Connect your GitHub account")
          : t("Install GitHub CLI")}
      </h2>
      <p>
        {status.installed
          ? t("Citropy uses the GitHub account signed in on this computer. Sign in, then refresh the connection.")
          : t("Install GitHub CLI to connect repositories, pull requests, and issues.")}
      </p>
      {status.installed ? (
        <button
          className="btn"
          data-variant="primary"
          onClick={async () => {
            try {
              onMessage((await github("authenticate", {})).message);
            } catch (error) {
              onMessage((error as Error).message);
            }
          }}
        >{" "}{t("Sign in to GitHub")}{" "}</button>
      ) : (
        <GitHubLink href="https://cli.github.com/">{" "}{t("Get GitHub CLI")}{" "}</GitHubLink>
      )}
      <button className="btn" onClick={onRefresh}>
        <RefreshCw size={15} />{" "}{t("Refresh connection")}{" "}</button>
      <details>
        <summary>{t("Connection details")}</summary>
        <pre>{status.error}</pre>
      </details>
    </div>
  );
}

export function GitHubAccount({
  account,
  workspaceRepo,
  loading,
  onRefresh,
}: {
  account: GitHubUser;
  workspaceRepo?: string;
  loading: boolean;
  onRefresh: () => void;
}) {
  const t = useI18n();
  return (
    <div className="github-account scroll">
      <div className="github-account-identity">
        <img src={account.avatar_url} alt="" />
        <div>
          <h2>{account.name || account.login}</h2>
          <p>@{account.login}</p>
        </div>
        <span className="github-state" data-tone="good">
          <Check size={16} />{" "}{t("Connected")}{" "}</span>
      </div>
      <div className="github-account-details">
        <div>
          <strong>{t("GitHub host")}</strong>
          <span>github.com</span>
        </div>
        <div>
          <strong>{t("Authentication")}</strong>
          <span>{t("GitHub CLI on this computer")}</span>
        </div>
        <div>
          <strong>{t("Workspace")}</strong>
          <span>{workspaceRepo ?? t("No GitHub remote connected")}</span>
        </div>
      </div>
      <p className="github-meta">{" "}{t("Citropy uses your existing GitHub permissions. Credentials stay on this computer and are never sent to the browser.")}{" "}</p>
      <div className="github-detail-actions">
        <button className="btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />{" "}{t("Refresh connection")}{" "}</button>
        <GitHubLink href="https://github.com/settings/profile">{" "}{t("Manage account")}{" "}</GitHubLink>
      </div>
    </div>
  );
}
