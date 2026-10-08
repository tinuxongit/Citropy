import type { ComponentType } from "react";
import type { ToolShape } from "../../../../shared/protocol.ts";
import { LayersIcon } from "../LayersIcon.tsx";
import { PlanIcon } from "../PlanIcon.tsx";
import { GlobeIcon } from "../GlobeIcon.tsx";
import { SearchIcon } from "./actions.tsx";
import { FilePlusIcon, FileTextIcon } from "./files.tsx";
import { MonitorIcon } from "./hardware.tsx";
import type { IconProps } from "./kit.tsx";
import { WrenchIcon } from "./objects.tsx";
import { EditIcon } from "./pencil.tsx";
import { TerminalIcon } from "./squares.tsx";

export const shapeIcon = {
  command: TerminalIcon,
  read: FileTextIcon,
  write: FilePlusIcon,
  edit: EditIcon,
  search: SearchIcon,
  web: GlobeIcon,
  computer: MonitorIcon,
  task: LayersIcon,
  todo: PlanIcon,
  generic: WrenchIcon,
} satisfies Record<ToolShape, ComponentType<IconProps>>;
