import { useEffect, useState } from "react";
import { GlobeIcon } from "./GlobeIcon.tsx";
import { CheckIcon, PlusIcon } from "./icons/marks.tsx";
import { DownloadIcon } from "./icons/arrows.tsx";
import { TrashIcon } from "./icons/actions.tsx";
import { RefreshIcon } from "./icons/rotation.tsx";
import { CookieIcon } from "./icons/objects.tsx";
import { api } from "../lib/api.ts";
import { confirmAction, useApp } from "../lib/store.ts";
import { saveProjectDefaults } from "../lib/actions.ts";
import { resolveProjectSettings } from "../../../shared/project-settings.ts";
import type {
  BrowserProfile,
  ImportBrowser,
} from "../../../shared/features.ts";
import { Select } from "./Select.tsx";
import { setSearchEngine } from "../lib/preferences.ts";
import { SEARCH_ENGINES, type SearchEngine } from "../lib/web-search.ts";
import { ActionError } from "./ActionError.tsx";

interface Profiles {
  selected: string;
  profiles: BrowserProfile[];
}

interface ImportResult {
  imported: number;
  skipped: number;
}

interface ClearResult {
  ok: true;
}

export function BrowserProfiles() {
  const projects = useApp((state) => state.projects);
  const projectDefaults = useApp((state) => state.projectDefaults);
  const searchEngine = useApp((state) => state.searchEngine);
  const [projectId, setProjectId] = useState(
    useApp.getState().activeProjectId ?? projects[0]?.id ?? "",
  );
  const [data, setData] = useState<Profiles>();
  const [sources, setSources] = useState<ImportBrowser[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [profileId, setProfileId] = useState("workspace");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const query = `?projectId=${projectId}`;
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setData(undefined);
    setError("");
    Promise.all([
      api<Profiles>(`browser/profiles${query}`, { signal: controller.signal }),
      api<ImportBrowser[]>(`browser/sources${query}`, {
        signal: controller.signal,
      }),
    ])
      .then(([profiles, available]) => {
        setData(profiles);
        setProfileId(profiles.selected);
        setSources(available);
        setSourceId(available[0]?.id ?? "");
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [projectId, revision]);
  const send = <T,>(path: string, method: string, input: object) =>
    api<T>(`browser/${path}${query}`, { method, body: JSON.stringify(input) });
  const loadProfiles = () => api<Profiles>(`browser/profiles${query}`);
  const showProfiles = (result: Profiles) => {
    setData(result);
    setProfileId(result.selected);
  };
  const perform = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setName("");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectProfile = (id: string) =>
    perform(async () =>
      showProfiles(await send<Profiles>("profiles", "POST", { selected: id })),
    );
  const addProfile = () =>
    perform(async () =>
      showProfiles(await send<Profiles>("profiles", "POST", { name })),
    );
  const deleteProfile = (id: string) =>
    perform(async () =>
      showProfiles(await send<Profiles>("profiles", "DELETE", { id })),
    );
  const importCookies = () =>
    perform(async () => {
      const result = await send<ImportResult>("import", "POST", {
        profileId,
        sourceId,
      });
      setMessage(
        `Imported ${result.imported} cookies. ${result.skipped} expired, partitioned, or protected cookies were skipped.`,
      );
      setData(await loadProfiles());
    });
  const clearData = async (kind: string) => {
    if (
      await confirmAction({
        title: `Clear ${kind} from this profile?`,
        description:
          kind === "cookies"
            ? "Websites in this browser profile will sign out."
            : "Cached pages and resources will be downloaded again.",
        label: `Clear ${kind}`,
        danger: true,
      })
    )
      await perform(async () => {
        await send<ClearResult>("clear", "POST", { profileId, kind });
        setMessage("Browser data cleared.");
        setData(await loadProfiles());
      });
  };
  const configureAccess = async (browserAccess: boolean) => {
    setBusy(true);
    setError("");
    try {
      await saveProjectDefaults({ ...projectDefaults, browserAccess });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="feature-stack">
      <div className="settings-group">
        <label className="setting-row">
          <span>
            <strong>Search engine</strong>
            <small>Used when you type words instead of a web address in the browser bar.</small>
          </span>
          <Select
            value={searchEngine}
            onChange={(value) => setSearchEngine(value as SearchEngine)}
            options={Object.entries(SEARCH_ENGINES).map(([id, engine]) => ({
              value: id,
              label: engine.label,
              icon: (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={engine.icon} />
                </svg>
              ),
            }))}
          />
        </label>
        <label className="setting-row">
          <span>
            <strong>Provider browser access</strong>
            <small>Allow conversations to use the shared browser tools. Folders can override this in Projects.</small>
          </span>
          <input
            className="setting-switch"
            type="checkbox"
            role="switch"
            checked={Boolean(resolveProjectSettings(projectDefaults).browserAccess)}
            disabled={busy}
            onChange={(event) => void configureAccess(event.target.checked)}
          />
        </label>
      </div>
      <label className="feature-field">
        Workspace
        <Select
          disabled={busy}
          value={projectId}
          onChange={setProjectId}
          options={projects.map((project) => ({ value: project.id, label: project.name }))}
        />
      </label>
      <section className="settings-group">
        <div className="feature-section-heading">
          <h2>Browser profiles</h2>
          <button
            className="icon-btn"
            type="button"
            disabled={busy}
            aria-label="Refresh browser profiles"
            onClick={() => setRevision((value) => value + 1)}
          >
            <RefreshIcon size={16} />
          </button>
        </div>
        <p className="feature-note">
          Keep logins separate. The selected profile is used for new browser tabs; open tabs keep their current profile.
        </p>
        {data?.profiles.map((profile) => (
          <div className="profile-row" key={profile.id}>
            <GlobeIcon size={21} />
            <span>
              <strong>{profile.id === "workspace" ? "Workspace" : profile.name}</strong>
              <small>
                {profile.cookies}{" "}cookies ·{" "}{profile.activeTabs}{" "}open tabs{" "}</small>
            </span>
            <button
              className="btn"
              disabled={busy || data.selected === profile.id}
              onClick={() => void selectProfile(profile.id)}
            >
              {data.selected === profile.id ? (
                <>
                  <CheckIcon size={14} />
                  Selected
                </>
              ) : (
                "Use profile"
              )}
            </button>
            {profile.id !== "workspace" && (
              <button
                className="icon-btn"
                disabled={busy || profile.activeTabs > 0}
                title={
                  profile.activeTabs
                    ? "Close this profile's tabs first"
                    : "Delete profile"
                }
                aria-label={`Delete ${profile.name}`}
                onClick={async () => {
                  if (
                    await confirmAction({
                      title: `Delete ${profile.name}?`,
                      description:
                        "Remove this profile and its saved browser data.",
                      label: "Delete profile",
                      danger: true,
                    })
                  )
                    await deleteProfile(profile.id);
                }}
              >
                <TrashIcon size={15} />
              </button>
            )}
          </div>
        ))}
        <form
          className="feature-inline"
          onSubmit={(event) => {
            event.preventDefault();
            void addProfile();
          }}
        >
          <input
            aria-label="New browser profile name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Profile name"
            maxLength={60}
          />
          <button className="btn" disabled={busy || !name.trim() || !data}>
            <PlusIcon size={15} />
            Add profile
          </button>
        </form>
      </section>
      <section className="settings-group">
        <h2 className="settings-group-heading">Import signed-in sessions</h2>
        <p className="feature-note">{" "}Copy cookies from a browser on this computer. Close that browser first. Your system may ask to unlock its keyring. Some sites may require you to sign in again.{" "}</p>
        <div className="feature-form-grid">
          <label className="feature-field">{" "}Import from{" "}<Select
              disabled={busy}
              value={sourceId}
              onChange={setSourceId}
              options={[
                {
                  value: "",
                  label: sources.length
                    ? "Select a browser"
                    : "No supported browser profiles found",
                },
                ...sources.map((source) => ({ value: source.id, label: source.name })),
              ]}
            />
          </label>
          <label className="feature-field">{" "}Citropy profile{" "}<Select
              disabled={busy}
              value={profileId}
              onChange={setProfileId}
              options={(data?.profiles ?? []).map((profile) => ({
                value: profile.id,
                label: profile.id === "workspace" ? "Workspace" : profile.name,
              }))}
            />
          </label>
        </div>
        <button
          className="btn"
          data-variant="primary"
          disabled={busy || !sourceId || !data}
          onClick={() => void importCookies()}
        >
          <DownloadIcon size={15} />
          {busy ? "Working…" : "Import cookies"}
        </button>
      </section>
      <section className="settings-group">
        <h2 className="settings-group-heading">Profile data</h2>
        <p className="feature-note">{" "}Applies to{" "}
          {data?.profiles.find((profile) => profile.id === profileId)?.name ??
            "the selected profile"}
          .
        </p>
        <div className="feature-inline">
          <button
            className="btn"
            disabled={busy || !data}
            onClick={() => clearData("cookies")}
          >
            <CookieIcon size={15} />{" "}Clear cookies{" "}</button>
          <button
            className="btn"
            disabled={busy || !data}
            onClick={() => clearData("cache")}
          >{" "}Clear cache{" "}</button>
        </div>
      </section>
      {message && (
        <p className="feature-success" role="status">
          {message}
        </p>
      )}
      <ActionError className="feature-error" message={error} onDismiss={() => setError("")} />
      {!projectId && (
        <p className="feature-note">{" "}Open a workspace to manage browser profiles.{" "}</p>
      )}
    </div>
  );
}
