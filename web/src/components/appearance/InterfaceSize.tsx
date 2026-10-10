import { setUiSize, useApp } from "../../lib/store.ts";
import { DEFAULT_UI_SCALE } from "../../lib/app-state.ts";
import { Range } from "../Range.tsx";

export function InterfaceSize() {
  const uiSize = useApp((state) => state.uiSize);
  return (
    <>
      <h2 className="settings-group-heading">Interface size</h2>
      <div className="settings-group size-setting">
        <div className="size-setting-heading">
          <div>
            <label htmlFor="ui-scale">UI size</label>
            <p>Scale text, icons, and controls together. Large windows grow it a little more.</p>
          </div>
          <output htmlFor="ui-scale">{uiSize}%</output>
        </div>
        <Range
          id="ui-scale"
          min={75}
          max={150}
          step="5"
          value={uiSize}
          aria-valuetext={`${uiSize} percent`}
          onChange={(event) => setUiSize(Number(event.target.value))}
        />
        <div className="size-setting-labels">
          <span>Compact</span>
          <button
            type="button"
            onClick={() => setUiSize(DEFAULT_UI_SCALE)}
            disabled={uiSize === DEFAULT_UI_SCALE}
          >{" "}Reset to default{" "}</button>
          <span>Larger</span>
        </div>
      </div>
    </>
  );
}
