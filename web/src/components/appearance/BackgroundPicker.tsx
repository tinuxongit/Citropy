import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "../icons/marks.tsx";
import { ImagePlusIcon } from "../icons/media.tsx";
import { reportError } from "../../lib/api.ts";
import { saveBackgroundFile, useBackgroundFile, type BackgroundFileKind } from "../../lib/background-files.ts";
import { setStageBackground } from "../../lib/preferences.ts";
import { useApp } from "../../lib/store.ts";
import type { StageBackground } from "../../lib/app-state.ts";
import { OptionStrip } from "../OptionStrip.tsx";
import { DotBackground } from "../DotBackground.tsx";

const BACKGROUNDS: { id: StageBackground; label: string }[] = [
  { id: "ascii", label: "ASCII noise" },
  { id: "dots", label: "Dots" },
  { id: "default", label: "Default" },
];

const ASCII_TEXTURE = ".·:-=+*#=-:·. ·:=+*#*+=:· .·:-=+*#".repeat(8);

function CustomImageOption({ selected }: { selected: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const kind: BackgroundFileKind = "image";
  const file = useBackgroundFile(kind);
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!file) return;
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return (
    <div className="custom-background" data-option={kind}>
      <button
        className="theme-option"
        type="button"
        aria-pressed={selected}
        title="Shows an image or GIF as the background."
        onClick={() => file ? setStageBackground(kind) : input.current?.click()}
      >
        <span
          className="background-preview"
          data-background={kind}
          data-empty={!url || undefined}
          style={url ? { backgroundImage: `url("${url}")` } : undefined}
          aria-hidden="true"
        >
          {!url && <><ImagePlusIcon size={18} />Upload an image or GIF</>}
        </span>
        <span className="theme-option-label">
          <span>Custom image</span>
          {selected && <CheckIcon size={16} />}
        </span>
      </button>
      {file && <button className="custom-background-replace" type="button" onClick={() => input.current?.click()}>Replace file…</button>}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          if (!chosen) return;
          saveBackgroundFile(kind, chosen).then(() => setStageBackground(kind)).catch(reportError);
        }}
      />
    </div>
  );
}

export function BackgroundPicker() {
  const stageBackground = useApp((state) => state.stageBackground);
  return (
    <>
      <h2 className="settings-group-heading">Background</h2>
      <OptionStrip label="Conversation background" selected={stageBackground}>
        {BACKGROUNDS.map(({ id, label }) => (
          <button
            className="theme-option"
            key={id}
            data-option={id}
            type="button"
            aria-pressed={stageBackground === id}
            onClick={() => setStageBackground(id)}
          >
            <span className="background-preview" data-background={id} aria-hidden="true">
              {id === "ascii" && ASCII_TEXTURE}
              {id === "dots" && <DotBackground className="background-preview-dots" />}
            </span>
            <span className="theme-option-label">
              <span>{label}</span>
              {stageBackground === id && <CheckIcon size={16} />}
            </span>
          </button>
        ))}
        <CustomImageOption selected={stageBackground === "image"} />
      </OptionStrip>
    </>
  );
}
