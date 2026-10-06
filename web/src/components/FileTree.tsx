import { lazy, Suspense } from "react";

const EditorWorkspace = lazy(() => import("./editor/EditorWorkspace.tsx"));

export function FileTree({
  panelId,
  active,
}: {
  panelId: string;
  active: boolean;
}) {
  return (
    <Suspense
      fallback={
        <div className="pane-empty" role="status">
          Loading editor…
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
