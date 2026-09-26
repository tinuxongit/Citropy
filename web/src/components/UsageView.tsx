import { useEffect, useRef, useState, type ReactNode } from "react";
import { Gauge, Hash, MessagesSquare, RefreshCw } from "lucide-react";
import { api } from "../lib/api.ts";
import { clock, cost, providerLabels, tokens } from "../lib/format.ts";
import { SectionSidebar } from "./SectionSidebar.tsx";
import type { UsageReport } from "../../../shared/features.ts";
import { currentLocale, useI18n } from "../lib/i18n.ts";
import { PixelLoader } from "./PixelLoader.tsx";
import { ProviderLimits } from "./UsageLimits.tsx";

const SECTIONS = [
  { id: "limits", label: "Limits", icon: Gauge },
  { id: "tokens", label: "Tokens", icon: Hash },
  { id: "conversations", label: "Conversations", icon: MessagesSquare },
] as const;

type SectionId = typeof SECTIONS[number]["id"];

export function UsageView({
  sidebarOpen,
  onBack,
  navigation,
}: {
  sidebarOpen: boolean;
  onBack: () => void;
  navigation?: ReactNode;
}) {
  const t = useI18n();
  const [data, setData] = useState<UsageReport>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [provider, setProvider] = useState("");
  const [active, setActive] = useState<SectionId>("limits");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api<UsageReport>("usage", { signal: controller.signal })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [revision]);

  useEffect(() => {
    const root = scroller.current;
    if (!root || !data) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id.replace("usage-", "") as SectionId);
    }, { root, rootMargin: "0px 0px -60% 0px" });
    for (const { id } of SECTIONS) {
      const element = root.querySelector(`#usage-${id}`);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [data]);

  const updated = data ? Math.max(0, ...data.providers.map((entry) => entry.updatedAt)) : 0;
  const limited = data?.providers.filter((entry) => entry.windows.length) ?? [];
  const unlimited = data?.providers.filter((entry) => !entry.windows.length).map((entry) => providerLabels[entry.provider]) ?? [];
  const metrics = data ? [
    { label: t("Input tokens"), value: tokens(data.totals.input) },
    { label: t("Output tokens"), value: tokens(data.totals.output) },
    { label: t("Cache read"), value: tokens(data.totals.cacheRead) },
    { label: t("Cache write"), value: tokens(data.totals.cacheWrite) },
    { label: t("Reported cost"), value: data.totals.costUsd ? cost(data.totals.costUsd) : t("Not reported") },
  ] : [];

  return (
    <section className="section-view" aria-label={t("Usage")}>
      <SectionSidebar activeItem={active} open={sidebarOpen} title={t("Usage")} onBack={onBack} navigation={navigation}>
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            className="section-link"
            aria-current={active === id ? "page" : undefined}
            onClick={() => {
              setActive(id);
              scroller.current?.querySelector(`#usage-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <Icon size={17} />
            <span>{t(label)}</span>
          </button>
        ))}
      </SectionSidebar>
      <div className="settings scroll" ref={scroller}>
        <div className="settings-inner usage-inner">
          <header className="settings-heading">
            <div>
              <h1>{t("Usage")}</h1>
              <p>{t("Account allowance and tokens used in Citropy.")}</p>
            </div>
            <button className="btn" disabled={busy} onClick={() => setRevision((value) => value + 1)}>
              {busy ? <PixelLoader size={15} /> : <RefreshCw size={15} />}
              {t("Refresh")}
            </button>
          </header>
          {error && <p className="feature-error" role="alert">{error}</p>}
          {!data && !error ? (
            <div className="pane-empty" role="status">{t("Reading provider usage…")}</div>
          ) : data && (
            <div className="usage-sections">
              <section id="usage-limits">
                <div className="feature-section-heading">
                  <h2>{t("Remaining allowance")}</h2>
                  {updated > 0 && <span>{t("Updated {time}", { time: clock(updated) })}</span>}
                </div>
                {limited.length > 0 && (
                  <div className="usage-limit-grid">
                    {limited.map((entry) => <ProviderLimits key={entry.provider} entry={entry} />)}
                  </div>
                )}
                <p className="settings-note">
                  {unlimited.length > 0 && `${t("No allowance data from {providers}.", { providers: new Intl.ListFormat(currentLocale(), { type: "conjunction" }).format(unlimited) })} `}
                  {t("Allowance is shared with other apps using the same account.")}
                </p>
              </section>
              <section id="usage-tokens">
                <div className="feature-section-heading">
                  <h2>{t("Tokens")}</h2>
                  <span>{t("Saved Citropy conversations")}</span>
                </div>
                <div className="metric-grid usage-metrics">
                  {metrics.map(({ label, value }) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </section>
              <section id="usage-conversations">
                <div className="feature-section-heading">
                  <h2>{t("Conversation usage")}</h2>
                  <select aria-label={t("Filter usage by provider")} value={provider} onChange={(event) => setProvider(event.target.value)}>
                    <option value="">{t("All providers")}</option>
                    <option value="claude">Claude Code</option>
                    <option value="codex">Codex</option>
                    <option value="opencode">OpenCode</option>
                    <option value="cursor">Cursor</option>
                    <option value="pi">Pi</option>
                  </select>
                </div>
                <div className="feature-table-wrap scroll">
                  <table className="feature-table">
                    <thead>
                      <tr>
                        <th>{t("Conversation")}</th>
                        <th>{t("Input")}</th>
                        <th>{t("Output")}</th>
                        <th>{t("Cache read")}</th>
                        <th>{t("Cache write")}</th>
                        <th>{t("Cost")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.conversations
                        .filter((thread) => !provider || thread.provider === provider)
                        .map((thread) => (
                          <tr key={thread.id}>
                            <td>
                              <strong className="truncate">{thread.title}</strong>
                              <small>{providerLabels[thread.provider]} · {thread.model || t("Model not reported")}</small>
                            </td>
                            <td>{tokens(thread.usage.input + (thread.provider === "codex" ? 0 : thread.usage.cacheRead + thread.usage.cacheWrite))}</td>
                            <td>{tokens(thread.usage.output)}</td>
                            <td>{tokens(thread.usage.cacheRead)}</td>
                            <td>{tokens(thread.usage.cacheWrite)}</td>
                            <td>{thread.usage.costUsd ? cost(thread.usage.costUsd) : "—"}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
