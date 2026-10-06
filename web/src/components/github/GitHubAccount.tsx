import { Check, Github, RefreshCw } from "lucide-react";
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
  return (
    <div className="github-connect">
      <Github size={38} />
      <h2>
        {status.installed
          ? "Connect your GitHub account"
          : "Install GitHub CLI"}
      </h2>
      <p>
        {status.installed
          ? "Citropy uses the GitHub account signed in on this computer. Sign in, then refresh the connection."
          : "Install GitHub CLI to connect repositories, pull requests, and issues."}
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
        >{" "}Sign in to GitHub{" "}</button>
      ) : (
        <GitHubLink href="https://cli.github.com/">{" "}Get GitHub CLI{" "}</GitHubLink>
      )}
      <button className="btn" onClick={onRefresh}>
        <RefreshCw size={15} />{" "}Refresh connection{" "}</button>
      <details>
        <summary>Connection details</summary>
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
  return (
    <div className="github-account scroll">
      <div className="github-account-identity">
        <img src={account.avatar_url} alt="" />
        <div>
          <h2>{account.name || account.login}</h2>
          <p>@{account.login}</p>
        </div>
        <span className="github-state" data-tone="good">
          <Check size={16} />{" "}Connected{" "}</span>
      </div>
      <div className="github-account-details">
        <div>
          <strong>GitHub host</strong>
          <span>github.com</span>
        </div>
        <div>
          <strong>Authentication</strong>
          <span>GitHub CLI on this computer</span>
        </div>
        <div>
          <strong>Workspace</strong>
          <span>{workspaceRepo ?? "No GitHub remote connected"}</span>
        </div>
      </div>
      <p className="github-meta">{" "}Citropy uses your existing GitHub permissions. Credentials stay on this computer and are never sent to the browser.{" "}</p>
      <div className="github-detail-actions">
        <button className="btn" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />{" "}Refresh connection{" "}</button>
        <GitHubLink href="https://github.com/settings/profile">{" "}Manage account{" "}</GitHubLink>
      </div>
    </div>
  );
}
