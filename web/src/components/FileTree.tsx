import { useI18n } from "../lib/i18n.ts";
import { lazy, Suspense } from "react";

const EditorWorkspace = lazy(() => import("./editor/EditorWorkspace.tsx"));

export function FileTree({
  panelId,
  active,
}: {
  panelId: string;
  active: boolean;
}) {
  const t = useI18n();
  return (
    <Suspense
      fallback={
        <div className="pane-empty" role="status">
          {t("Loading editor…")}
        </div>
      }
    >
      <EditorWorkspace
        panelId={panelId}
        active={active}
      />
    </Suspense>
  );
}
