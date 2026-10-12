import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/choice-inputs.css";
import "./styles/app.css";
import "./styles/thread-tabs.css";
import "./styles/sidebar.css";
import "./styles/settings.css";
import "./styles/providers.css";
import "./styles/conversation.css";
import "./styles/markdown.css";
import "./styles/diff.css";
import "./styles/composer.css";
import "./styles/inspector.css";
import "./styles/workbench.css";
import "./styles/overlays.css";
import "./styles/strip-peek.css";
import "./styles/whats-new.css";
import "./styles/thread-details.css";
import "./styles/git.css";
import "./styles/github.css";
import "./styles/features.css";
import "./styles/projects.css";
import "./styles/settings-pages.css";
import "./styles/stepper.css";
import "./styles/usage.css";
import "./styles/media.css";
import "./styles/dialogs.css";
import "./styles/virtual-list.css";
import "./styles/environments.css";
import "./styles/bots.css";
import "./styles/routines.css";
import { initializeEnvironment } from "./lib/environment.ts";
import { applyReleaseDefaults } from "./lib/release-defaults.ts";
import { applyCustomColor } from "./lib/custom-theme.ts";
import { followVisualViewport } from "./lib/visual-viewport.ts";

async function start() {
  if (/Mac|iPhone|iPad/.test(navigator.platform)) {
    document.documentElement.style.setProperty(
      "--font-mono", 'Menlo, Monaco, "Courier New", monospace',
    );
  } else if (/Win/.test(navigator.platform)) {
    document.documentElement.style.setProperty(
      "--font-mono", 'Consolas, "Courier New", monospace',
    );
  }
  followVisualViewport();
  await initializeEnvironment();
  applyReleaseDefaults();
  const [{ App }, { connect, logClientError }, { useApp, applyUiScale, followWindowSize }, { hideBootScreenWhenConnected }] = await Promise.all([import("./App.tsx"), import("./lib/socket.ts"), import("./lib/store.ts"), import("./lib/boot-screen.ts")]);

  if (!window.citropyDesktop && window.loomDesktop)
    window.citropyDesktop = window.loomDesktop;

  const { theme, scheme, customColor } = useApp.getState();
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.scheme = scheme;
  applyCustomColor(customColor, scheme);
  applyUiScale();
  followWindowSize();
  hideBootScreenWhenConnected();
  connect();
  window.addEventListener("error", (event) => logClientError(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => logClientError(event.reason));

  const root = document.getElementById("root");
  if (!root) throw new Error("missing #root");

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

}

void start().catch(error => {
  document.getElementById("boot-screen")?.remove();
  const root = document.getElementById("root");
  if (root) root.textContent = error.message;
});
