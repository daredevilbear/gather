import * as yaml from "js-yaml";
import Head from "next/head";
import { useEffect, useRef, useState } from "react";

import styles from "./editor.module.css";
import {
  Catalog,
  EditorPreviewContext,
  GuidedFields,
  HOME_WIDGETS,
  IconPicker,
  IntegrationPicker,
  TokenList,
} from "./pickers";
import SystemSettings from "./system";

import GatherIcon from "components/gather/icon";
import GatherMark from "components/gather/mark";
import themes from "utils/styles/themes";

const SECTIONS = [
  {
    id: "appearance",
    file: "settings.yaml",
    label: "Appearance",
    description: "A space that feels like yours. Choose your dashboard’s look and identity.",
    icon: "palette",
    group: "YOUR WORKSPACE",
  },
  {
    id: "layout",
    file: "settings.yaml",
    label: "Layout & tabs",
    description: "Give every service a place. Organize groups into tabs and choose how they’re displayed.",
    icon: "layout",
    group: "YOUR WORKSPACE",
  },
  {
    id: "account",
    file: "settings.yaml",
    label: "Account & inbox",
    description: "Keep account controls and notifications close at hand.",
    icon: "person",
    group: "YOUR WORKSPACE",
  },
  {
    id: "services",
    file: "services.yaml",
    label: "Services",
    description: "Your apps, organized. Add services, arrange groups, and connect integrations.",
    icon: "grid",
    group: "CONTENT",
  },
  {
    id: "bookmarks",
    file: "bookmarks.yaml",
    label: "Bookmarks",
    description: "A home for the links you reach for every day.",
    icon: "bookmark",
    group: "CONTENT",
  },
  {
    id: "widgets",
    file: "widgets.yaml",
    label: "Home widgets",
    description: "A useful welcome. Personalize the greeting, weather, and information on Home.",
    icon: "home",
    group: "CONTENT",
  },
  {
    id: "notifications",
    file: "gather-notifications.json",
    label: "Notifications",
    description: "Choose your topics and personalize push notifications.",
    icon: "bell",
    group: "PREFERENCES",
  },
  {
    id: "css",
    file: "custom.css",
    label: "Custom CSS",
    description: "Fine-tune the details with your own styles.",
    icon: "code",
    group: "ADVANCED",
  },
  {
    id: "js",
    file: "custom.js",
    label: "Custom JavaScript",
    description: "Extend dashboard behavior with your own scripts.",
    icon: "code",
    group: "ADVANCED",
  },
  {
    id: "system",
    file: null,
    label: "System settings",
    description: "Manage sign-in, connections and administrator access.",
    icon: "settings",
    group: "ADMINISTRATION",
  },
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
                  <EntryDetails
                    value={config}
                    bookmarks={bookmarks}
                    onChange={(next) => update(entries.map((x, n) => (n === j ? { [entryName]: next } : x)))}
                  />
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
function EntryDetails({ value, onChange, bookmarks }) {
  const fields = bookmarks
    ? [
        ["href", "Link URL"],
        ["abbr", "Short label"],
        ["icon", "Icon"],
      ]
    : [
        ["href", "Service URL"],
        ["description", "Description"],
        ["icon", "Icon"],
      ];
  const links = bookmarks && Array.isArray(value) ? value : [value];
  return (
    <>
      {links.map((link, index) => {
        if (!object(link)) return <p key={index}>This custom entry can be edited in Source.</p>;
        const update = (next) =>
          onChange(bookmarks && Array.isArray(value) ? value.map((item, n) => (n === index ? next : item)) : next);
        return (
          <div key={index}>
            <div className={styles.grid}>
              {fields.map(([key, label]) =>
                key === "icon" ? (
                  <IconPicker key={key} value={link.icon} onChange={(icon) => update({ ...link, icon })} />
                ) : (
                  <label key={key}>
                    {label}
                    <input
                      type={key === "href" ? "url" : "text"}
                      value={link[key] || ""}
                      onChange={(e) => update({ ...link, [key]: e.target.value })}
                    />
                  </label>
                ),
              )}
            </div>
            {!bookmarks && (
              <IntegrationPicker
                value={link.widget}
                onChange={(widget) => {
                  const next = { ...link };
                  if (widget) next.widget = widget;
                  else delete next.widget;
                  update(next);
                }}
              />
            )}
          </div>
        );
      })}
      <p className={styles.sourceHint}>Custom options are preserved. Use Source to edit them.</p>
    </>
  );
}
function Dashboard({ value, onChange, view, request }) {
  if (!object(value)) return <p>Settings must be an object. Use the source view to repair it.</p>;
  const set = (key, next) => onChange({ ...value, [key]: next });
  const gather = value.gather || {};
  return (
    <>
      {view === "appearance" && (
        <>
          <div
            className={styles.appearancePreview}
            data-theme={value.theme || "system"}
            style={{
              "--preview-light": themes[value.color]?.light || themes.slate.light,
              "--preview-dark": themes[value.color]?.dark || themes.slate.dark,
            }}
          >
            <div>
              <GatherMark className={styles.mark} />
              <strong>{value.title || "Gather"}</strong>
              <span>LIVE PREVIEW</span>
            </div>
            <div className={styles.previewTabs}>
              <b>Home</b>
              <span>Media</span>
              <span>Systems</span>
            </div>
            <h3>Welcome home.</h3>
            <p>{value.description || "Your everyday, together."}</p>
            <div className={styles.previewCards}>
              <span>Your services</span>
              <span>Your favorites</span>
              <span>At a glance</span>
            </div>
          </div>
          <section className={styles.card}>
            <h2>Make it yours</h2>
            <p>The name and icon that represent your dashboard.</p>
            <div className={styles.grid}>
              {[
                ["title", "Dashboard title"],
                ["description", "Description"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input value={value[key] || ""} onChange={(e) => set(key, e.target.value)} />
                </label>
              ))}
              <IconPicker title="App icon" localOnly value={value.favicon} onChange={(next) => set("favicon", next)} />
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
          <p className={styles.sourceHint}>More appearance options are available in Source.</p>
        </>
      )}
      {view === "account" && (
        <section className={styles.card}>
          <h2>Account and inbox</h2>
          <p>These controls live in the Gather application bar.</p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={gather.accountMenu !== false}
              onChange={(e) => set("gather", { ...gather, accountMenu: e.target.checked })}
            />
            Show account in the application bar
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={gather.notifications === true}
              onChange={(e) => set("gather", { ...gather, notifications: e.target.checked })}
            />
            Enable notifications in the application bar
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
      )}
      {view === "layout" && (
        <Layout request={request} value={value.layout || {}} onChange={(next) => set("layout", next)} />
      )}
    </>
  );
}
function Layout({ value, onChange, request }) {
  const [name, setName] = useState("");
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    let active = true;
    Promise.all(
      ["services.yaml", "bookmarks.yaml"].map((file) =>
        request(null, file).then((doc) => yaml.load(doc.text, { schema: yaml.JSON_SCHEMA })),
      ),
    )
      .then((files) => {
        if (active)
          setGroups([
            ...new Set(
              files.flatMap((file) => (Array.isArray(file) ? file.flatMap((group) => Object.keys(group)) : [])),
            ),
          ]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [request]);
  if (!object(value)) return <p>This layout uses a custom structure. Edit it in Source.</p>;
  const update = (group, patch) => onChange({ ...value, [group]: { ...value[group], ...patch } });
  return (
    <>
      {Object.entries(value).map(([group, options]) => (
        <section className={styles.card} key={group}>
          <div className={styles.heading}>
            <h2>{group}</h2>
            <button
              type="button"
              aria-label={`Remove layout for ${group}`}
              onClick={() => {
                const next = { ...value };
                delete next[group];
                onChange(next);
              }}
            >
              Remove layout
            </button>
          </div>
          <p>
            Choose where this group appears and how its services are arranged. Removing this layout keeps its services
            and restores their default placement.
          </p>
          <div className={styles.grid}>
            <label>
              Tab name
              <input
                value={options?.tab || ""}
                placeholder="Visible on every tab"
                onChange={(e) => update(group, { tab: e.target.value })}
              />
            </label>
            <label>
              Arrangement
              <select value={options?.style || "column"} onChange={(e) => update(group, { style: e.target.value })}>
                <option value="column">Vertical list</option>
                <option value="row">Card grid</option>
              </select>
            </label>
            <label>
              Columns
              <select
                value={options?.columns || ""}
                onChange={(e) => {
                  const next = { ...options };
                  if (e.target.value) next.columns = Number(e.target.value);
                  else delete next.columns;
                  onChange({ ...value, [group]: next });
                }}
              >
                <option value="">Automatic</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <GuidedFields
            fields={[
              { key: "header", kind: "boolean", title: "Show group heading" },
              { key: "initiallyCollapsed", kind: "boolean", title: "Start collapsed" },
            ]}
            value={{ header: true, ...options }}
            onChange={(next) => onChange({ ...value, [group]: next })}
          />
        </section>
      ))}
      <section className={styles.card}>
        <h2>Add a group layout</h2>
        <p>Use the same group name as in Services or Bookmarks.</p>
        <div className={styles.add}>
          <select aria-label="Group to arrange" value={name} onChange={(e) => setName(e.target.value)}>
            <option value="">Choose an existing group</option>
            {groups
              .filter((group) => !Object.hasOwn(value, group))
              .map((group) => (
                <option key={group}>{group}</option>
              ))}
          </select>
          <button
            type="button"
            disabled={
              !name.trim() ||
              Object.hasOwn(value, name.trim()) ||
              ["__proto__", "constructor", "prototype"].includes(name.trim())
            }
            onClick={() => {
              onChange({ ...value, [name.trim()]: { tab: "Home", style: "row", columns: 3 } });
              setName("");
            }}
          >
            Add layout
          </button>
        </div>
      </section>
    </>
  );
}
function Widgets({ value, onChange }) {
  const [library, setLibrary] = useState(false);
  if (!Array.isArray(value)) return <p>Use Source to repair this widget list.</p>;
  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <h2>Your Home widgets</h2>
          <p>Shown on Home, in this order.</p>
        </div>
        <button type="button" onClick={() => setLibrary(!library)}>
          {library ? "Close library" : "Add Home widget"}
        </button>
      </div>
      {library && (
        <Catalog
          title="Home widget library"
          items={HOME_WIDGETS}
          onSelect={(item) => {
            onChange([...value, { [item.id]: structuredClone(item.defaults) }]);
            setLibrary(false);
          }}
        />
      )}
      {value.map((widget, index) => {
        const [type, config] = Object.entries(widget)[0] || [];
        const item = HOME_WIDGETS.find((entry) => entry.id === type);
        return (
          <details className={styles.entry} key={index}>
            <summary>
              {item?.name || pretty(type || "Widget")}
              <span className={styles.entryMeta}>Widget {index + 1}</span>
            </summary>
            {type === "logo" && (
              <IconPicker
                value={config.icon}
                onChange={(icon) =>
                  onChange(value.map((entry, i) => (i === index ? { [type]: { ...config, icon } } : entry)))
                }
              />
            )}
            {type === "stocks" && (
              <TokenList
                title="Watchlist"
                values={Array.isArray(config.watchlist) ? config.watchlist : []}
                pattern="^[A-Z0-9.^:-]+$"
                limit={8}
                placeholder="Ticker, e.g. AAPL"
                onChange={(watchlist) =>
                  onChange(value.map((entry, i) => (i === index ? { [type]: { ...config, watchlist } } : entry)))
                }
              />
            )}
            {item ? (
              <GuidedFields
                fields={[
                  ...item.fields,
                  ...(type === "search" && config.provider === "custom"
                    ? [{ key: "url", kind: "url", title: "Search URL" }]
                    : []),
                ]}
                value={config}
                onChange={(next) => onChange(value.map((entry, i) => (i === index ? { [type]: next } : entry)))}
              />
            ) : (
              <p>This widget uses custom settings. Edit them in Source.</p>
            )}
            {type === "openmeteo" && <p>Leave coordinates empty to use the browser’s location.</p>}
            <Move
              index={index}
              length={value.length}
              move={(direction) => onChange(reorder(value, index, direction))}
              remove={() => onChange(value.filter((_, i) => i !== index))}
            />
          </details>
        );
      })}
      <p className={styles.sourceHint}>Additional widget options remain available in Source.</p>
    </section>
  );
}
function Notifications({ value, onChange }) {
  return (
    <section className={styles.card}>
      <h2>Push & topics</h2>
      <p>
        Choose the topics you want to receive and how push notifications look. Leave a field empty to use the default.
        Connection credentials are managed by your server administrator.
      </p>
      <TokenList
        title="Subscribed topics"
        values={value.topics ? value.topics.split(",") : []}
        pattern="^[A-Za-z0-9_-]+$"
        placeholder="Topic name"
        onChange={(topics) => {
          const next = { ...value };
          if (topics.length) next.topics = topics.join(",");
          else delete next.topics;
          onChange(next);
        }}
      />
      <p className={styles.sourceHint}>
        Leave empty to use server defaults. The notification account needs access to these topics.
      </p>
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
      <IconPicker
        title="Push icon"
        localOnly
        value={value.icon}
        onChange={(icon) => {
          const next = { ...value };
          if (icon) next.icon = icon;
          else delete next.icon;
          onChange(next);
        }}
      />
    </section>
  );
}
export default function SettingsEditor({ request = api, preview = false }) {
  const [section, setSection] = useState("appearance");
  const [canManageSystem, setCanManageSystem] = useState(preview);
  const [systemDirty, setSystemDirty] = useState(false);
  const formRef = useRef(null);
  const sectionTitle = useRef(null);
  const previousSection = useRef(section);
  useEffect(() => {
    if (previousSection.current !== section) {
      sectionTitle.current?.focus({ preventScroll: true });
      sectionTitle.current?.scrollIntoView?.({ block: "start" });
      previousSection.current = section;
    }
  }, [section]);
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
  function resetChanges() {
    setText(doc.text);
    setError("");
    setPending(null);
    setBackup("");
    setConfirmRestore(false);
    setStatus(`Unsaved changes in ${file} reset to the last saved version.`);
  }
  const load = async (id) => {
    if (id === "system") {
      setSection(id);
      setText(doc?.text || "");
      setStatus("");
      setError("");
      return;
    }
    const next = SECTIONS.find((item) => item.id === id).file;
    setBusy(true);
    setError("");
    setStatus("");
    setDoc(null);
    setBackup("");
    setConfirmRestore(false);
    try {
      const result = await request(null, next);
      setSection(id);
      setSystemDirty(false);
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
    request(null, "settings.yaml")
      .then((result) => {
        if (active) {
          setDoc(result);
          setText(result.text);
          setCanManageSystem(preview || result.capabilities?.system === true);
          if (
            (preview || result.capabilities?.system === true) &&
            new URLSearchParams(window.location.search).get("section") === "system"
          )
            setSection("system");
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
  }, [request, preview]);
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
    if (action !== "restore" && mode === "visual" && !rawOnly) {
      const invalid = formRef.current?.querySelector(":invalid");
      if (invalid) {
        const details = invalid.closest("details");
        if (details) details.open = true;
        invalid.reportValidity();
        invalid.focus();
        return;
      }
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await request({ action, file, text, revision: doc.revision, backup });
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
    if (preview) {
      setStatus("Local preview is ready. Live connections are tested on your deployed dashboard.");
      return;
    }
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
  const current = SECTIONS.find((item) => item.id === section);
  function selectSection(item) {
    if (item.id === section) return;
    if (section !== "system" && item.file === file) {
      setSection(item.id);
      return;
    }
    if (dirty || systemDirty) setPending(item.id);
    else load(item.id);
  }
  return (
    <EditorPreviewContext.Provider value={preview}>
      <main className={styles.editor}>
        <Head>
          <title>Gather settings</title>
        </Head>
        <header className={styles.top}>
          <div className={styles.brand}>
            <GatherMark className={styles.mark} />
            <strong>Gather</strong>
            <span>/</span>
            <span>Settings</span>
          </div>
          {/* Full navigation preserves the unsaved-edit beforeunload warning. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className={styles.back}>
            <GatherIcon name="arrowLeft" /> Back to dashboard
          </a>
        </header>
        <div className={styles.shell}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarTitle}>
              <h1>Dashboard settings</h1>
              <p>A little more you.</p>
            </div>
            <nav aria-label="Settings sections">
              {[
                ...new Set(
                  SECTIONS.filter((item) => item.id !== "system" || canManageSystem).map((item) => item.group),
                ),
              ].map((group) => (
                <div key={group} className={styles.navGroup}>
                  <span className={styles.eyebrow}>{group}</span>
                  {SECTIONS.filter((item) => item.group === group && (item.id !== "system" || canManageSystem)).map(
                    (item) => (
                      <button
                        key={item.id}
                        aria-current={section === item.id ? "page" : undefined}
                        disabled={busy}
                        onClick={() => selectSection(item)}
                      >
                        <GatherIcon name={item.icon} />
                        <span>{item.label}</span>
                        {item.file === file && dirty && <i aria-hidden="true" title="Unsaved changes" />}
                      </button>
                    ),
                  )}
                </div>
              ))}
            </nav>
            <div className={styles.sidebarTools}>
              <button disabled={busy} onClick={checks}>
                <GatherIcon name="check" /> Check connections
              </button>
            </div>
          </aside>
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
            {section === "system" && canManageSystem && (
              <SystemSettings embedded preview={preview} onDirtyChange={setSystemDirty} titleRef={sectionTitle} />
            )}
            {doc && section !== "system" && (
              <>
                <div className={styles.heading}>
                  <div>
                    <h2 ref={sectionTitle} tabIndex={-1} className={styles.sectionTitle}>
                      {current.label}
                    </h2>
                    <p>{current.description}</p>
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
                <fieldset ref={formRef} disabled={busy} className={styles.form}>
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
                      {file === "settings.yaml" && (
                        <Dashboard value={value} onChange={change} view={section} request={request} />
                      )}
                      {["services.yaml", "bookmarks.yaml"].includes(file) && (
                        <Groups value={value} onChange={change} bookmarks={file === "bookmarks.yaml"} />
                      )}
                      {file === "widgets.yaml" && <Widgets value={value} onChange={change} />}
                      {file === "gather-notifications.json" && <Notifications value={value} onChange={change} />}
                    </>
                  )}
                </fieldset>
                <div className={styles.toolbar}>
                  <span className={styles.saveState}>
                    <GatherIcon name={dirty ? "edit" : "check"} />
                    {dirty ? "Unsaved changes" : "All changes saved"}
                    <small>
                      {preview ? "This preview stays in your browser" : "A backup is created with every save"}
                    </small>
                  </span>
                  <button disabled={busy} onClick={() => save("validate")}>
                    Validate
                  </button>
                  <button disabled={busy || !dirty} className={styles.primary} onClick={() => save()}>
                    Save & apply
                  </button>
                  <button disabled={busy || !dirty} onClick={resetChanges} title={`Reset unsaved changes in ${file}`}>
                    Reset changes
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
                <p className={styles.hint}>
                  Visual edits preserve your configuration values and placeholders. YAML formatting and comments may be
                  normalized; previous versions are available in Backups & restore.
                </p>
              </>
            )}
          </div>
        </div>
      </main>
    </EditorPreviewContext.Provider>
  );
}
