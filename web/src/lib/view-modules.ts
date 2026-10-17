import { lazy, type ComponentType } from "react";

export const VIEW_MODULES = {
  github: () => import("../components/github/GitHub.tsx"),
  git: () => import("../components/GitManager.tsx"),
  settings: () => import("../components/Settings.tsx"),
  usage: () => import("../components/UsageView.tsx"),
};

type View = keyof typeof VIEW_MODULES;
type ViewModule<V extends View> = Awaited<ReturnType<(typeof VIEW_MODULES)[V]>>;

const loaded = new Map<View, unknown>();

function load<V extends View>(view: V): Promise<ViewModule<V>> {
  return VIEW_MODULES[view]().then((module) => {
    loaded.set(view, module);
    return module as ViewModule<V>;
  });
}

export function preloadView(view: string) {
  if (view in VIEW_MODULES) void load(view as View);
}

// React holds back content that suspended for up to 300ms after it loads, so a view that is
// already loaded is handed over through a thenable that resolves at once and never suspends.
export function lazyView<V extends View, P extends object>(
  view: V,
  pick: (module: ViewModule<V>) => ComponentType<P>,
) {
  return lazy(() => {
    const module = loaded.get(view) as ViewModule<V> | undefined;
    if (!module) return load(view).then((module) => ({ default: pick(module) }));
    const ready = { default: pick(module) };
    return { then: (resolve: (value: typeof ready) => void) => resolve(ready) } as Promise<
      typeof ready
    >;
  });
}
