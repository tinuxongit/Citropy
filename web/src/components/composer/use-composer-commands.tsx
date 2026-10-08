import type { RefObject } from "react";
import { ChartIcon } from "../ChartIcon.tsx";
import { BookIcon } from "../BookIcon.tsx";
import { CollapseIcon } from "../icons/media.tsx";
import { BrainIcon } from "../icons/objects.tsx";
import { PlanIcon } from "../PlanIcon.tsx";
import { ShieldCheckIcon } from "../icons/status.tsx";
import { BoltIcon } from "../BoltIcon.tsx";
import { configureThread } from "../../lib/actions.ts";
import type {
  ModelOption,
  ProviderInfo,
  ThreadMeta,
} from "../../../../shared/protocol.ts";

export function useComposerCommands({
  thread,
  provider,
  model,
  onCompact,
  onUsage,
  onSkills,
  modelButton,
  effortButton,
  permissionButton,
}: {
  thread: ThreadMeta | undefined;
  provider: ProviderInfo | undefined;
  model: ModelOption | undefined;
  onCompact: () => void;
  onUsage?: () => void;
  onSkills?: () => void;
  modelButton: RefObject<HTMLButtonElement | null>;
  effortButton: RefObject<HTMLButtonElement | null>;
  permissionButton: RefObject<HTMLButtonElement | null>;
}) {
  const threadId = thread?.id;
  return [
    ...(provider?.capabilities?.compact
      ? [
          {
            id: "compact",
            label: "/compact",
            hint: "Compact context and keep the visible history",
            icon: <CollapseIcon size={16} />,
            idleOnly: true,
            run: onCompact,
          },
        ]
      : []),
    {
      id: "usage",
      label: "/usage",
      hint: "See usage and remaining allowance",
      icon: <ChartIcon size={16} />,
      idleOnly: false,
      run: () => onUsage?.(),
    },
    {
      id: "skills",
      label: "/skills",
      hint: "Manage installed skills",
      icon: <BookIcon size={16} />,
      idleOnly: false,
      run: () => onSkills?.(),
    },
    {
      id: "model",
      label: "/model",
      hint: "Choose a model",
      icon: <BrainIcon size={16} />,
      idleOnly: false,
      run: () => modelButton.current?.click(),
    },
    {
      id: "plan",
      label: "/plan",
      hint: "Switch to Plan only permissions",
      icon: <PlanIcon size={16} />,
      idleOnly: false,
      run: () => {
        if (threadId) configureThread(threadId, { permissionMode: "plan" });
      },
    },
    ...(model?.efforts?.length || model?.fastMode
      ? [
          {
            id: "effort",
            label: "/effort",
            hint: "Choose reasoning effort and speed",
            icon: <BrainIcon size={16} />,
            idleOnly: false,
            run: () => effortButton.current?.click(),
          },
        ]
      : []),
    ...(model?.fastMode
      ? [
          {
            id: "fast",
            label: "/fast",
            hint: thread?.fastMode ? "Turn fast mode off" : "Turn fast mode on",
            icon: <BoltIcon size={16} />,
            idleOnly: false,
            run: () => {
              if (threadId)
                configureThread(threadId, { fastMode: !thread?.fastMode });
            },
          },
        ]
      : []),
    {
      id: "permissions",
      label: "/permissions",
      hint: "Choose tool permissions",
      icon: <ShieldCheckIcon size={16} />,
      idleOnly: false,
      run: () => permissionButton.current?.click(),
    },
  ];
}
