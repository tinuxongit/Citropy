import { InfoIcon, WarningIcon } from "../icons/status.tsx";
import { Prose } from "./Prose.tsx";

interface Props {
  level: "info" | "warn" | "error";
  text: string;
}

export function Notice({ level, text }: Props) {
  return (
    <div className="notice" data-level={level}>
      {level === "info" ? <InfoIcon size={15} /> : <WarningIcon size={13} />}
      <Prose text={text} live={false} images={false} />
    </div>
  );
}
