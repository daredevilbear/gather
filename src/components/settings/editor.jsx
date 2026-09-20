import * as yaml from "js-yaml";
import Head from "next/head";
import { useEffect, useState } from "react";

import styles from "./editor.module.css";

const SECTIONS = [
  ["settings.yaml", "Dashboard", "Appearance, layout, account menu and notification inbox"],
  ["services.yaml", "Services", "Service groups, links and integration widgets"],
  ["bookmarks.yaml", "Bookmarks", "Organize your everyday links"],
  ["widgets.yaml", "Header widgets", "Greeting, weather, search and information widgets"],
  ["gather-notifications.json", "Push & topics", "Notification topics and push branding"],
  ["custom.css", "Custom CSS", "Dashboard styles"],
  ["custom.js", "Custom JavaScript", "Scripts run for every dashboard visitor"],
];
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const pretty = (s) => s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
async function api(body, file) {
  const response = await fetch(`/api/gather/settings${file ? `?file=${encodeURIComponent(file)}` : ""}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not load settings. Sign in again and retry.");
  return result;
}
function AddProperty({ onAdd, keys }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState("text");
  const invalid =
    !name.trim() || keys.includes(name.trim()) || ["__proto__", "constructor", "prototype"].includes(name.trim());
  return (
    <div className={styles.add}>
      <input
        aria-label="New property name"
        placeholder="Property name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select aria-label="New property type" value={kind} onChange={(e) => setKind(e.target.value)}>
        {["text", "number", "checkbox", "object", "list"].map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={invalid}
        onClick={() => {
          onAdd(name.trim(), { text: "", number: 0, checkbox: false, object: {}, list: [] }[kind]);
          setName("");
        }}
      >
        Add property
      </button>
    </div>
  );
}
export function Fields({ value, onChange, label = "Options", level = 0 }) {
  if (level > 15) return <p>Edit this deeply nested value in the source view.</p>;
  if (Array.isArray(value))
    return (
      <div className={styles.nested}>
        <strong>{label}</strong>
        {value.map((v, i) => (
          <div key={i} className={styles.row}>
            <Fields
              label={`Item ${i + 1}`}
              value={v}
              level={level + 1}
              onChange={(next) => onChange(value.map((x, n) => (n === i ? next : x)))}
            />
            <Move
              index={i}
              length={value.length}
              move={(direction) => {
                const copy = [...value];
                [copy[i], copy[i + direction]] = [copy[i + direction], copy[i]];
                onChange(copy);
              }}
              remove={() => onChange(value.filter((_, n) => n !== i))}
            />
          </div>
        ))}
        <button type="button" onClick={() => onChange([...value, typeof value[0] === "string" ? "" : {}])}>
          Add item
        </button>
      </div>
    );
  if (object(value))
    return (
      <div className={styles.fields}>
        {Object.entries(value).map(([key, v]) => (
          <div className={styles.property} key={key}>
            {typeof v === "object" && v !== null ? (
              <details>
                <summary>{pretty(key)}</summary>
                <Fields
                  value={v}
                  label={pretty(key)}
                  level={level + 1}
                  onChange={(next) => onChange({ ...value, [key]: next })}
                />
              </details>
            ) : (
              <label>
                {pretty(key)}
                {typeof v === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
                  />
                ) : (
                  <input
                    type={
                      typeof v === "number" ? "number" : /password|secret|token|apikey/i.test(key) ? "password" : "text"
                    }
                    autoComplete="off"
                    value={v ?? ""}
                    onChange={(e) =>
                      onChange({ ...value, [key]: typeof v === "number" ? Number(e.target.value) : e.target.value })
                    }
                  />
                )}
              </label>
            )}
            <button
              type="button"
              className={styles.small}
              aria-label={`Remove ${key}`}
              onClick={() => {
                const next = { ...value };
                delete next[key];
                onChange(next);
              }}
            >
              Remove
            </button>
          </div>
        ))}
        <AddProperty keys={Object.keys(value)} onAdd={(k, v) => onChange({ ...value, [k]: v })} />
      </div>
    );
  return (
    <label>
      {label}
      <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
function Move({ index, length, move, remove }) {
  return (
    <div className={styles.moves}>
      <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => move(-1)}>
        ↑
      </button>
      <button type="button" aria-label="Move down" disabled={index === length - 1} onClick={() => move(1)}>
        ↓
      </button>
      <button type="button" onClick={remove}>
        Remove
      </button>
    </div>
  );
}
function reorder(list, index, direction) {
  const next = [...list];
  [next[index], next[index + direction]] = [next[index + direction], next[index]];
  return next;
}
export function Groups({ value, onChange, bookmarks = false }) {
  if (!Array.isArray(value)) return <p>Use the source view to repair this configuration.</p>;
  return (
    <div>
      {value.map((group, i) => {
        const [name, entries] = Object.entries(group)[0] || ["", []];
        if (!Array.isArray(entries)) return <p key={i}>Group {name} requires a list. Use the source view.</p>;
        const update = (list) => onChange(value.map((g, n) => (n === i ? { [name]: list } : g)));
        return (
          <section className={styles.card} key={i}>
            <div className={styles.heading}>
              <label>
                Group name
                <input
                  value={name}
                  onChange={(e) => onChange(value.map((g, n) => (n === i ? { [e.target.value]: entries } : g)))}
                />
              </label>
              <Move
                index={i}
                length={value.length}
                move={(d) => onChange(reorder(value, i, d))}
                remove={() => onChange(value.filter((_, n) => n !== i))}
              />
            </div>
            {entries.map((entry, j) => {
              const [entryName, config] = Object.entries(entry)[0] || ["", {}];
              return (
                <details className={styles.entry} key={j}>
                  <summary>{entryName || "Unnamed entry"}</summary>
                  <label>
                    {bookmarks ? "Bookmark name" : "Service name"}
                    <input
                      value={entryName}
                      onChange={(e) => update(entries.map((x, n) => (n === j ? { [e.target.value]: config } : x)))}
                    />
                  </label>
                  <Fields
                    value={config}
                    label="Details"
                    onChange={(next) => update(entries.map((x, n) => (n === j ? { [entryName]: next } : x)))}
                  />
                  {!bookmarks && object(config) && !config.widget && (
                    <button
                      type="button"
                      onClick={() =>
                        update(
                          entries.map((x, n) =>
                            n === j ? { [entryName]: { ...config, widget: { type: "", url: "", key: "" } } } : x,
                          ),
                        )
                      }
                    >
                      Add integration widget
                    </button>
                  )}
                  <Move
                    index={j}
                    length={entries.length}
                    move={(d) => update(reorder(entries, j, d))}
                    remove={() => update(entries.filter((_, n) => n !== j))}
                  />
                </details>
              );
            })}
            <button
              type="button"
              onClick={() =>
                update([
                  ...entries,
                  {
                    [bookmarks ? "New bookmark" : "New service"]: bookmarks
                      ? [{ href: "https://", icon: "", abbr: "" }]
                      : { href: "https://", description: "", icon: "" },
                  },
                ])
              }
            >
              Add {bookmarks ? "bookmark" : "service"}
            </button>
          </section>
        );
      })}
      <button type="button" onClick={() => onChange([...value, { [`New group ${value.length + 1}`]: [] }])}>
        Add group
      </button>
    </div>
  );
}
function Dashboard({ value, onChange }) {
  if (!object(value)) return <p>Settings must be an object. Use the source view to repair it.</p>;
  const set = (key, next) => onChange({ ...value, [key]: next });
  const gather = value.gather || {};
  return (
    <>
      <section className={styles.card}>
        <h2>Appearance</h2>
        <div className={styles.grid}>
          {[
            ["title", "Dashboard title"],
            ["description", "Description"],
            ["favicon", "Favicon / app icon URL"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input value={value[key] || ""} onChange={(e) => set(key, e.target.value)} />
            </label>
          ))}
          <label>
            Theme
            <select value={value.theme || ""} onChange={(e) => set("theme", e.target.value)}>
              <option value="">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            Color
            <select value={value.color || "slate"} onChange={(e) => set("color", e.target.value)}>
              {[
                "slate",
                "gray",
                "zinc",
                "neutral",
                "stone",
                "red",
                "orange",
                "amber",
                "yellow",
                "lime",
                "green",
                "emerald",
                "teal",
                "cyan",
                "sky",
                "blue",
                "indigo",
                "violet",
                "purple",
                "fuchsia",
                "pink",
                "rose",
              ].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <section className={styles.card}>
        <h2>Account and inbox</h2>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={gather.accountMenu === true}
            onChange={(e) => set("gather", { ...gather, accountMenu: e.target.checked })}
          />
          Show expandable account menu
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={gather.notifications === true}
            onChange={(e) => set("gather", { ...gather, notifications: e.target.checked })}
          />
          Show notification inbox
        </label>
        <label>
          Account settings URL
          <input
            type="url"
            value={gather.accountSettingsUrl || ""}
            placeholder="https://accounts.example.com"
            onChange={(e) => set("gather", { ...gather, accountSettingsUrl: e.target.value })}
          />
        </label>
        <p>
          Sign-in providers and administrator access are managed by the server operator. Push permission is enabled
          separately on each device from the inbox.
        </p>
      </section>
      <section className={styles.card}>
        <h2>Layout and tabs</h2>
        <p>Use group names matching Services and Bookmarks. Each group can have a tab, style and columns.</p>
        <Fields value={value.layout || {}} onChange={(next) => set("layout", next)} />
      </section>
      <details className={styles.card}>
        <summary>All dashboard options</summary>
        <Fields value={value} onChange={onChange} />
      </details>
    </>
  );
}
const WIDGETS = {
  greeting: { text: "Welcome home.", personalize: true },
  search: { provider: "google", target: "_blank" },
  datetime: { text_size: "xl", format: { dateStyle: "long", timeStyle: "short" } },
  openmeteo: { label: "Weather", latitude: 0, longitude: 0, units: "metric" },
  resources: { cpu: true, memory: true },
};
function Widgets({ value, onChange }) {
  const [type, setType] = useState("greeting");
  return (
    <>
      <Fields value={value} label="Header widgets (in display order)" onChange={onChange} />
      <div className={styles.add}>
        <select aria-label="Widget preset" value={type} onChange={(e) => setType(e.target.value)}>
          {Object.keys(WIDGETS).map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
        <button
          onClick={() => onChange([...(Array.isArray(value) ? value : []), { [type]: structuredClone(WIDGETS[type]) }])}
        >
          Add widget preset
        </button>
      </div>
    </>
  );
}
function Notifications({ value, onChange }) {
  return (
    <section className={styles.card}>
      <h2>Push & topics</h2>
      <p>
        These options apply to the notification companion when its runtime configuration mount is enabled. Empty
        configuration uses the server defaults. Server URL and publishing credentials stay in protected deployment
        configuration.
      </p>
      <label>
        Subscribed topics
        <input
          value={value.topics || ""}
          placeholder="Server default"
          onChange={(e) => {
            const next = { ...value };
            if (e.target.value) next.topics = e.target.value;
            else delete next.topics;
            onChange(next);
          }}
        />
        <small>Comma-separated. The companion’s ntfy account needs read access to every topic.</small>
      </label>
      <label>
        Push app name
        <input
          value={value.appName || ""}
          placeholder="Gather"
          onChange={(e) => {
            const next = { ...value };
            if (e.target.value) next.appName = e.target.value;
            else delete next.appName;
            onChange(next);
          }}
        />
      </label>
      <label>
        Push icon path
        <input
          value={value.icon || ""}
          placeholder="/android-chrome-512x512.png"
          onChange={(e) => {
            const next = { ...value };
            if (e.target.value) next.icon = e.target.value;
            else delete next.icon;
            onChange(next);
          }}
        />
        <small>
          Use an existing image on this dashboard. Installed iPhone app icons also use Dashboard’s favicon setting.
        </small>
      </label>
    </section>
  );
}
export default function SettingsEditor() {
  const [file, setFile] = useState("settings.yaml");
  const [doc, setDoc] = useState(null);
  const [text, setText] = useState("");
  const [mode, setMode] = useState("visual");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(null);
  const [backup, setBackup] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const dirty = !!doc && text !== doc.text;
  const rawOnly = file.endsWith(".css") || file.endsWith(".js");
  let value, parseError;
  try {
    value = rawOnly
      ? text
      : file.endsWith(".json")
        ? JSON.parse(text || "{}")
        : yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch {
    parseError = true;
  }
  const change = (next) =>
    setText(
      file.endsWith(".json") ? `${JSON.stringify(next, null, 2)}\n` : yaml.dump(next, { noRefs: true, lineWidth: 120 }),
    );
  const load = async (next) => {
    setBusy(true);
    setError("");
    setStatus("");
    setDoc(null);
    setBackup("");
    setConfirmRestore(false);
    try {
      const result = await api(null, next);
      setFile(next);
      setDoc(result);
      setText(result.text);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    api(null, "settings.yaml")
      .then((result) => {
        if (active) {
          setDoc(result);
          setText(result.text);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(action = "save") {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api({ action, file, text, revision: doc.revision, backup });
      if (action === "validate") setStatus("Validation passed. No changes saved.");
      else {
        setDoc(result);
        setText(result.text);
        setBackup("");
        setConfirmRestore(false);
        setStatus(
          result.applied
            ? "Saved and applied. A backup of the previous version is available below."
            : "Saved. Dashboard refresh failed; use Reload dashboard or ask the operator to restart the app.",
        );
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function checks() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const [app, notifications] = await Promise.all([
        fetch("/api/healthcheck", { cache: "no-store" }),
        fetch("/gather-notifications/health", { cache: "no-store" }),
      ]);
      const n = await notifications.json();
      setStatus(
        `Dashboard: ${app.ok ? "healthy" : "unavailable"}. Notification companion: ${notifications.ok && n.ready ? "connected to ntfy" : "not ready; check topics, credentials and deployment"}. Integration widgets can be checked on the dashboard after applying changes.`,
      );
    } catch {
      setError("Connection check failed. Check the companion deployment and reload.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.editor}>
      <Head>
        <title>Gather settings</title>
      </Head>
      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>GATHER / ADMINISTRATION</p>
          <h1>Dashboard settings</h1>
          <p>Make it yours. Changes are saved one section at a time.</p>
        </div>
        {/* A full navigation preserves the unsaved-edit beforeunload warning. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/">Back to dashboard</a>
      </header>
      <div className={styles.shell}>
        <nav aria-label="Settings sections">
          {SECTIONS.map(([key, label]) => (
            <button
              key={key}
              aria-current={file === key ? "page" : undefined}
              disabled={busy}
              onClick={() => (dirty ? setPending(key) : load(key))}
            >
              {label}
            </button>
          ))}
          <button disabled={busy} onClick={checks}>
            Check connections
          </button>
        </nav>
        <div className={styles.content}>
          {pending && (
            <section className={styles.notice} role="alert">
              <p>You have unsaved changes. Discard them and open another section?</p>
              <button
                onClick={() => {
                  const next = pending;
                  setPending(null);
                  load(next);
                }}
              >
                Discard changes
              </button>
              <button onClick={() => setPending(null)}>Keep editing</button>
            </section>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          {status && (
            <p className={styles.notice} role="status">
              {status}
            </p>
          )}
          {!doc && !busy && (
            <p>
              Ask the server operator to enable GATHER_EDITOR_ENABLED and authorize your account’s stable identity in
              GATHER_ADMIN_IDS.
            </p>
          )}
          {!doc && busy && <p role="status">Loading settings…</p>}
          {doc && (
            <>
              <div className={styles.heading}>
                <div>
                  <h2>{SECTIONS.find(([key]) => key === file)[1]}</h2>
                  <p>{SECTIONS.find(([key]) => key === file)[2]}</p>
                </div>
                {!rawOnly && (
                  <div className={styles.moves}>
                    <button aria-pressed={mode === "visual"} onClick={() => setMode("visual")}>
                      Visual
                    </button>
                    <button aria-pressed={mode === "source"} onClick={() => setMode("source")}>
                      Source
                    </button>
                  </div>
                )}
              </div>
              <fieldset disabled={busy} className={styles.form}>
                {rawOnly || mode === "source" ? (
                  <>
                    <p>
                      {rawOnly
                        ? "Custom code changes dashboard behavior for visitors. JavaScript runs with their signed-in access; only save code you trust."
                        : "Environment placeholders are preserved. Resolved environment secrets are never loaded into this editor."}
                    </p>
                    <label>
                      {file}
                      <textarea
                        className={styles.source}
                        spellCheck={false}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                      />
                    </label>
                  </>
                ) : parseError ? (
                  <p role="alert">Invalid syntax. Switch to Source to repair the file.</p>
                ) : (
                  <>
                    <p className={styles.hint}>
                      Visual edits preserve existing fields and environment placeholders, but normalize YAML formatting
                      and comments. A backup is created on every save.
                    </p>
                    {file === "settings.yaml" && <Dashboard value={value} onChange={change} />}
                    {["services.yaml", "bookmarks.yaml"].includes(file) && (
                      <Groups value={value} onChange={change} bookmarks={file === "bookmarks.yaml"} />
                    )}
                    {file === "widgets.yaml" && <Widgets value={value} onChange={change} />}
                    {file === "gather-notifications.json" && <Notifications value={value} onChange={change} />}
                  </>
                )}
              </fieldset>
              <div className={styles.toolbar}>
                <span>{dirty ? "Unsaved changes" : "Up to date"}</span>
                <button disabled={busy} onClick={() => save("validate")}>
                  Validate
                </button>
                <button disabled={busy || !dirty} className={styles.primary} onClick={() => save()}>
                  Save & apply
                </button>
                <button disabled={busy} onClick={() => (dirty ? setPending(file) : load(file))}>
                  Reload file
                </button>
              </div>
              <details className={styles.card}>
                <summary>Backups & restore</summary>
                <p>
                  Restore a previous version of this section. Restoring also backs up the current version. The most
                  recent 50 backups are listed.
                </p>
                <select
                  aria-label="Backup to restore"
                  value={backup}
                  onChange={(e) => {
                    setBackup(e.target.value);
                    setConfirmRestore(false);
                  }}
                >
                  <option value="">Choose a backup</option>
                  {doc.backups?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {new Date(b.date).toLocaleString()} · {b.id.slice(-8)}
                    </option>
                  ))}
                </select>
                <button disabled={!backup || busy} onClick={() => setConfirmRestore(true)}>
                  Restore selected backup
                </button>
                {confirmRestore && (
                  <div role="alert">
                    <p>Replace this file with the selected backup? Unsaved edits will be discarded.</p>
                    <button disabled={busy} onClick={() => save("restore")}>
                      Confirm restore
                    </button>
                    <button onClick={() => setConfirmRestore(false)}>Cancel</button>
                  </div>
                )}
              </details>
              <p>
                <a href="/" target="_blank" rel="noreferrer">
                  Open dashboard to verify changes ↗
                </a>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
