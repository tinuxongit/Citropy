import { useId, useState } from "react";
import type { PermissionRequest } from "../../../shared/protocol.ts";
import { answerPermission } from "../lib/actions.ts";
import { useApp } from "../lib/store.ts";
import { Ban, Check, CheckCheck, ChevronDown, shapeIcon } from "./icons.ts";
import { ProviderIcon } from "./ProviderIcon.tsx";
import { ComposerWideTab } from "./composer/ComposerWideTab.tsx";

function lines(value: unknown): string[] {
  return typeof value === "string" ? value.split("\n") : [];
}

function lede(request: PermissionRequest, project: string): string {
  const where = request.detail ? `${request.detail}/` : "";
  switch (request.shape) {
    case "command":
      return `Run this command in ${project}.`;
    case "write":
      return `Create ${where}${request.headline} in ${project}.`;
    case "edit":
      return `Change ${where}${request.headline}.`;
    case "read":
      return `Read ${where}${request.headline}.`;
    case "web":
      return "Fetch this address from the internet.";
    case "task":
      return "Start a subagent for this task.";
    default:
      return `Run the ${request.tool} tool.`;
  }
}

function Body({ request }: { request: PermissionRequest }) {
  const input = (request.input ?? {}) as Record<string, unknown>;

  if (request.shape === "command") {
    return (
      <pre className="ask-code">
        <code>{String(input.command ?? request.headline)}</code>
      </pre>
    );
  }

  if (request.shape === "edit" && typeof input.old_string === "string") {
    return (
      <div className="ask-diff">
        {lines(input.old_string).map((line, index) => (
          <div className="diff-line" data-type="del" key={`d${index}`}>
            <span className="diff-sign">-</span>
            <span className="diff-code">{line}</span>
          </div>
        ))}
        {lines(input.new_string).map((line, index) => (
          <div className="diff-line" data-type="add" key={`a${index}`}>
            <span className="diff-sign">+</span>
            <span className="diff-code">{line}</span>
          </div>
        ))}
      </div>
    );
  }

  if (request.shape === "write" && typeof input.content === "string") {
    return (
      <pre className="ask-code">
        <code>{input.content.slice(0, 4000)}</code>
      </pre>
    );
  }

  return (
    <pre className="ask-code">
      <code>{(JSON.stringify(request.input, null, 2) ?? "").slice(0, 4000)}</code>
    </pre>
  );
}

export function PermissionRow({ request }: { request: PermissionRequest }) {
  const [expanded, setExpanded] = useState(false);
  const waiting = useApp((state) => state.permissions.length - 1);
  const thread = useApp((state) => state.threads[request.threadId]);
  const project = useApp((state) => {
    const entry = state.projects.find((candidate) => candidate.id === thread?.projectId);
    return entry?.name ?? "this workspace";
  });
  const connected = useApp((state) => state.connected);
  const Icon = shapeIcon[request.shape];
  const summary = lede(request, project);
  const id = useId();
  const answer = (decision: "allow" | "allow_always" | "deny") =>
    answerPermission(request.id, decision);

  return (
    <ComposerWideTab className="permission-panel" aria-label="Review this action">
      <div className="permission-card">
        <div className="permission-row">
          <button
            type="button"
            className="permission-toggle"
            aria-expanded={expanded}
            aria-controls={id}
            onClick={() => setExpanded((value) => !value)}
          >
            <Icon size={15} aria-hidden="true" />
            <strong>Review this action</strong>
            {waiting > 0 && (
              <span className="permission-count">{waiting} waiting</span>
            )}
            <span className="permission-text truncate" title={summary}>{summary}</span>
            <ChevronDown size={14} className="permission-chevron" aria-hidden="true" />
          </button>
          <div className="permission-actions">
            <button
              className="btn"
              type="button"
              disabled={!connected}
              onClick={() => answer("deny")}
            >
              <Ban size={14} />
              Deny
            </button>
            <button
              className="btn"
              type="button"
              title="Allow this tool for this session"
              disabled={!connected}
              onClick={() => answer("allow_always")}
            >
              <CheckCheck size={14} />
              Always allow
            </button>
            <button
              className="btn"
              type="button"
              data-variant="primary"
              disabled={!connected}
              onClick={() => answer("allow")}
            >
              <Check size={14} />
              Allow once
            </button>
          </div>
        </div>
        <div id={id} hidden={!expanded} className="permission-details">
          <div className="permission-context">
            {thread && <ProviderIcon provider={thread.provider} />}
            <span className="truncate">{thread?.title ?? project}</span>
            <span>· {request.tool}</span>
          </div>
          <Body request={request} />
          {!connected && (
            <p className="dialog-error" role="alert">
              Reconnect to Citropy to respond.
            </p>
          )}
        </div>
      </div>
    </ComposerWideTab>
  );
}
