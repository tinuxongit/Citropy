import {
  CircleAlert,
  Clock3,
  Pause,
  MessageCircleQuestion,
} from "lucide-react";
import type { ThreadStatus } from "../../../shared/protocol.ts";
import { PixelLoader } from "./PixelLoader.tsx";

export function ThreadPulse({
  status,
  size = 13,
}: {
  status: ThreadStatus;
  size?: number;
}) {
  if (status === "idle") return null;
  if (status === "working" || status === "thinking") return <PixelLoader size={size} />;
  const Icon = status === "queued"
      ? Clock3
      : status === "error"
        ? CircleAlert
        : status === "awaiting"
          ? MessageCircleQuestion
          : Pause;
  return (
    <Icon
      size={size}
      aria-hidden="true"
    />
  );
}
