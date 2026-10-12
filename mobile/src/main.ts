import "../../web/src/styles/tokens.css";
import "../../web/src/styles/base.css";
import "./screen.css";
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from "@capacitor/barcode-scanner";
import { PairingLinkError, pairingOrigin, savedServer, saveServer, serverStatus, UNPAIRED_STATUS } from "./server.ts";
import { availableUpdate } from "./update.ts";

const SCAN_CANCELLED = "OS-PLUG-BARC-0006";

if (matchMedia("(prefers-color-scheme: light)").matches) document.documentElement.dataset.scheme = "light";

const element = <T extends HTMLElement>(selector: string) => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`The connect screen is missing ${selector}.`);
  return found;
};

function show(screen: string) {
  for (const section of document.querySelectorAll<HTMLElement>("[data-screen]")) section.hidden = section.dataset.screen !== screen;
}

function showError(message: string) {
  const error = element("[data-error]");
  error.textContent = message;
  error.hidden = false;
}

function openServer(origin: string) {
  location.replace(origin);
}

function pair(link: string) {
  try {
    saveServer(pairingOrigin(link));
    location.replace(link.trim());
  } catch (error) {
    if (!(error instanceof PairingLinkError)) throw error;
    showError(error.message);
  }
}

async function scan() {
  try {
    const { ScanResult } = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE });
    pair(ScanResult);
  } catch (error) {
    if ((error as { code?: string }).code === SCAN_CANCELLED) return;
    throw error;
  }
}

window.addEventListener("unhandledrejection", (event) => showError(String(event.reason?.message ?? event.reason)));

for (const button of document.querySelectorAll("[data-action='scan']")) button.addEventListener("click", () => void scan());
for (const button of document.querySelectorAll("[data-action='retry']")) button.addEventListener("click", () => openServer(savedServer()!));
document.querySelector<HTMLFormElement>("[data-paste]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  pair(new FormData(event.currentTarget as HTMLFormElement).get("link") as string);
});

const server = savedServer();
const offline = document.body.dataset.page === "offline";
if (offline) {
  for (const label of document.querySelectorAll("[data-server]")) label.textContent = new URL(server!).host;
  const status = await serverStatus(server!);
  show(status === UNPAIRED_STATUS ? "unpaired" : "offline");
  if (status && status >= 400 && status !== UNPAIRED_STATUS) showError(`Your computer answered with error ${status}.`);
} else if (server && !new URLSearchParams(location.search).has("scan")) {
  const update = await availableUpdate();
  if (update) {
    element("[data-version]").textContent = update.version;
    element<HTMLAnchorElement>("[data-action='update']").href = update.url;
    element("[data-action='later']").addEventListener("click", () => openServer(server));
    show("update");
  } else {
    openServer(server);
  }
} else {
  show("connect");
}
