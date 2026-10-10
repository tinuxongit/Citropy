import { useEffect, useState } from "react";
import { ChevronDownIcon } from "./icons/chevrons.tsx";
import { MonitorIcon, TabletIcon } from "./icons/hardware.tsx";
import { RotatePhoneIcon } from "./icons/rotation.tsx";
import { PhoneIcon } from "./PhoneIcon.tsx";
import { SlidersIcon } from "./SlidersIcon.tsx";
import { Menu } from "./Menu.tsx";
import type { BrowserAction, BrowserState } from "../../../shared/workbench.ts";

const presets = [
  { id: "desktop", label: "Desktop", width: 1920, height: 1080, mobile: false, Icon: MonitorIcon },
  { id: "laptop", label: "Laptop", width: 1440, height: 900, mobile: false, Icon: MonitorIcon },
  { id: "tablet", label: "Tablet", width: 768, height: 1024, mobile: true, Icon: TabletIcon },
  { id: "phone", label: "Phone", width: 390, height: 844, mobile: true, Icon: PhoneIcon },
];

interface Props {
  state: BrowserState;
  disabled: boolean;
  onResize: (action: Extract<BrowserAction, { action: "resize" }>) => void;
}

export function BrowserViewport({ state, disabled, onResize }: Props) {
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState(String(state.width));
  const [height, setHeight] = useState(String(state.height));
  const selected = presets.find(
    (preset) =>
      preset.width === state.width &&
      preset.height === state.height &&
      preset.mobile === Boolean(state.mobile),
  );
  const Icon = selected?.Icon ?? (state.mobile ? PhoneIcon : MonitorIcon);
  const valid =
    Number.isInteger(Number(width)) && Number(width) >= 320 && Number(width) <= 3840 &&
    Number.isInteger(Number(height)) && Number(height) >= 240 && Number(height) <= 2160;

  useEffect(() => {
    setWidth(String(state.width));
    setHeight(String(state.height));
  }, [state.width, state.height]);

  return (
    <div className="browser-viewport">
      <div className="browser-viewport-bar">
        <Menu
          header="Page resolution"
          width={244}
          trigger={({ id, open, toggle }) => (
            <button
              id={id}
              type="button"
              className="browser-viewport-trigger"
              aria-label="Page resolution"
              aria-haspopup="menu"
              aria-expanded={open}
              disabled={disabled}
              onClick={toggle}
            >
              <Icon size={14} />
              <span>{selected ? selected.label : "Custom"}</span>
              <span className="browser-viewport-size">{state.width} × {state.height}</span>
              <ChevronDownIcon size={12} />
            </button>
          )}
          items={[
            ...presets.map(({ id, label, width, height, mobile, Icon }) => ({
              id,
              label: label,
              hint: `${width} × ${height}`,
              icon: <Icon size={16} />,
              selected: selected?.id === id,
              onSelect: () => {
                setCustom(false);
                onResize({ action: "resize", width, height, mobile });
              },
            })),
            {
              id: "custom",
              label: "Custom size",
              hint: "Set the page width and height",
              icon: <SlidersIcon size={16} />,
              selected: !selected,
              onSelect: () => {
                setWidth(String(state.width));
                setHeight(String(state.height));
                setCustom(true);
              },
            },
          ]}
        />
        <label className="browser-mode" title="Mobile sites and touch. Reloads when changed.">
          Mobile mode
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={Boolean(state.mobile)}
            disabled={disabled || Boolean(state.dialog)}
            onChange={(event) => onResize({
              action: "resize",
              width: state.width,
              height: state.height,
              mobile: event.target.checked,
            })}
          />
        </label>
        <button
          type="button"
          className="icon-btn"
          aria-label="Rotate page viewport"
          title="Rotate viewport"
          disabled={disabled || state.height < 320 || state.width > 2160}
          onClick={() => onResize({
            action: "resize",
            width: state.height,
            height: state.width,
            mobile: state.mobile,
          })}
        >
          <RotatePhoneIcon size={21} />
        </button>
      </div>
      {custom && (
        <form
          className="browser-viewport-custom"
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid || disabled) return;
            onResize({ action: "resize", width: Number(width), height: Number(height), mobile: state.mobile });
            setCustom(false);
          }}
        >
          <div className="browser-viewport-fields">
            <label>
              Width
              <input
                type="number"
                min={320}
                max={3840}
                step={1}
                required
                value={width}
                onChange={(event) => setWidth(event.target.value)}
                autoFocus
              />
            </label>
            <span aria-hidden="true">×</span>
            <label>
              Height
              <input
                type="number"
                min={240}
                max={2160}
                step={1}
                required
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </label>
            <span>px</span>
          </div>
          <div className="browser-viewport-actions">
            <button type="button" className="btn" onClick={() => setCustom(false)}>
              Cancel
            </button>
            <button type="submit" className="btn" data-variant="primary" disabled={disabled || !valid}>
              Apply size
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
