import { CircleAlertIcon, ClockIcon } from "./icons/status.tsx";
import { PauseIcon } from "./icons/media.tsx";
import { QuestionMessageIcon } from "./icons/messages.tsx";
import type { ThreadStatus } from "../../../shared/protocol.ts";
import { Loader } from "./Loader.tsx";

export function ThreadPulse({
  status,
  size = 13,
}: {
  status: ThreadStatus;
  size?: number;
}) {
  if (status === "idle") return null;
  if (status === "working" || status === "thinking") return <Loader size={size} />;
  const Icon = status === "queued"
      ? ClockIcon
      : status === "error"
        ? CircleAlertIcon
        : status === "awaiting"
          ? QuestionMessageIcon
          : PauseIcon;
  return (
    <Icon
      size={size}
      aria-hidden="true"
    />
  );
}
