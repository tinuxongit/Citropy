export const VIEW_MODULES = {
  github: () => import("../components/github/GitHub.tsx"),
  git: () => import("../components/GitManager.tsx"),
  settings: () => import("../components/Settings.tsx"),
  usage: () => import("../components/UsageView.tsx"),
};

export function preloadView(view: string) {
  if (view in VIEW_MODULES) void VIEW_MODULES[view as keyof typeof VIEW_MODULES]();
}
