import * as yaml from "js-yaml";
import Head from "next/head";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import styles from "./editor.module.css";
import Migration from "./migration";
import { DragHandle, moveTo, useOrdering } from "./ordering";
import {
  Catalog,
  EditorPreviewContext,
  GuidedFields,
  HOME_WIDGETS,
  IconPicker,
  iconURL,
  IntegrationPicker,
  TokenList,
} from "./pickers";
import SystemSettings from "./system";
import Users from "./users";
import Variables from "./variables";
import Vcenter from "./vcenter";

import GatherIcon from "components/gather/icon";
import GatherMark from "components/gather/mark";
import { slugifyAndEncode } from "components/tab";
import { CONNECTION_FILES } from "utils/gather/config-files";
import { dashboardTabs, renameDashboardTab } from "utils/gather/tabs";
import themes from "utils/styles/themes";

const PersonalEditorContext = createContext(false);
const PERSONAL_SECTIONS = ["appearance", "tabs", "layout", "services", "bookmarks", "widgets", "backups"];
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
    id: "tabs",
    file: "settings.yaml",
    label: "Tabs",
    description: "Add, rename and order your dashboard tabs.",
    icon: "tabs",
    group: "YOUR WORKSPACE",
  },
  {
    id: "layout",
    file: "settings.yaml",
    label: "Layout",
    description: "Assign groups to tabs and choose how their services are displayed.",
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
  ...CONNECTION_FILES.map((file) => ({
    id: file.split(".")[0],
    file,
    label: {
      "docker.yaml": "Docker",
      "kubernetes.yaml": "Kubernetes",
      "proxmox.yaml": "Proxmox",
      "vcenter.yaml": "vCenter",
    }[file],
    description:
      file === "vcenter.yaml"
        ? "Connect vCenter and add VM or ESXi host cards, or an inventory summary, to your dashboard."
        : "Manage the existing Homepage connection configuration. Referenced credentials and mounted files must be available on the server. Source changes are versioned and backed up.",
    icon: file.split(".")[0],
    group: "CONNECTIONS",
    protected: true,
  })),
  {
    id: "users",
    file: null,
    label: "Users & access",
    description: "Manage people, roles and activity.",
    icon: "person",
    group: "ADMINISTRATION",
  },
  {
    id: "migration",
    file: null,
    label: "Import from Homepage",
    description: "Bring an existing Homepage dashboard into Gather.",
    icon: "import",
    group: "ADMINISTRATION",
  },
  {
    id: "variables",
    file: null,
    label: "Secrets & variables",
    description: "Manage reusable connection values.",
    icon: "lock",
    group: "ADMINISTRATION",
  },
  {
    id: "backups",
    file: null,
    label: "Backup & restore",
    description: "Restore saved configuration versions in one place.",
    icon: "history",
    group: "ADMINISTRATION",
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
function Move({ index, length, move, remove, label = "item" }) {
  return (
    <div className={styles.moves}>
      <button type="button" aria-label={`Move ${label} up`} disabled={index === 0} onClick={() => move(-1)}>
        ↑
      </button>
      <button type="button" aria-label={`Move ${label} down`} disabled={index === length - 1} onClick={() => move(1)}>
        ↓
      </button>
      <button type="button" aria-label={`Remove ${label}`} onClick={remove}>
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
function ContentRow({ name, subtitle, icon, kind = "grid", badge, children, open = false, drag, drop }) {
  return (
    <details className={styles.contentRow} open={open || undefined} {...drop}>
      <summary aria-label={`Edit ${name}`}>
        {drag && <DragHandle {...drag} />}
        <span className={styles.contentIcon}>
          {icon ? (
            // Configured icons include local uploads and external URLs; use the same direct loading as the picker.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={iconURL(icon)} alt="" loading="lazy" width="24" height="24" />
          ) : (
            <GatherIcon name={kind} />
          )}
        </span>
        <span className={styles.contentIdentity}>
          <strong>{name}</strong>
          <small>{subtitle}</small>
        </span>
        {badge && <span className={styles.contentBadge}>{badge}</span>}
        <span className={styles.editAffordance} title="Edit">
          <GatherIcon name="edit" />
        </span>
      </summary>
      <div className={styles.contentFields}>{children}</div>
    </details>
  );
}
export function Groups({ value, onChange, bookmarks = false, layout = {}, tabs = [], onEditLayout }) {
  const [collapsed, setCollapsed] = useState({});
  const [renaming, setRenaming] = useState(null);
  const [newEntry, setNewEntry] = useState(null);
  const ordering = useOrdering((scope, from, to) => {
    if (scope.startsWith("group:")) {
      // Move within the displayed tab while preserving interleaved groups on other tabs.
      const indices = value
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => `group:${layout[Object.keys(group)[0]]?.tab || ""}` === scope)
        .map(({ index }) => index);
      const reordered = moveTo(
        indices.map((index) => value[index]),
        from,
        to,
      );
      const next = [...value];
      indices.forEach((index, position) => {
        next[index] = reordered[position];
      });
      onChange(next);
      setCollapsed({});
      setRenaming(null);
    } else {
      const groupIndex = Number(scope.slice(6));
      const [name, entries] = Object.entries(value[groupIndex])[0];
      onChange(value.map((group, index) => (index === groupIndex ? { [name]: moveTo(entries, from, to) } : group)));
    }
    setNewEntry(null);
  });
  if (!Array.isArray(value)) return <p>Use the source view to repair this configuration.</p>;
  const total = value.reduce(
    (count, group) => count + (Array.isArray(Object.values(group)[0]) ? Object.values(group)[0].length : 0),
    0,
  );
  return (
    <div className={styles.contentList}>
      <span className={styles.orderAnnouncement} role="status">
        {ordering.announcement}
      </span>
      <p className={styles.orderHint}>
        Drag the handles to reorder within a group or tab. Use Alt + ↑ / ↓ on a handle with the keyboard.
      </p>
      <div className={styles.contentToolbar}>
        <p>
          {total} {bookmarks ? "bookmark" : "service"}
          {total === 1 ? "" : "s"} across {value.length} {value.length === 1 ? "group" : "groups"}
        </p>
        <button
          type="button"
          onClick={() => {
            onChange([...value, { [`New group ${value.length + 1}`]: [] }]);
            setRenaming(value.length);
          }}
        >
          + Add group
        </button>
      </div>
      {value
        .map((group, i) => ({ group, i }))
        .sort((a, b) => {
          const rank = (group) => tabs.indexOf(layout[Object.keys(group)[0]]?.tab);
          return rank(a.group) - rank(b.group);
        })
        .map(({ group, i }, displayIndex, ordered) => {
          const [name, entries] = Object.entries(group)[0] || ["", []];
          if (!Array.isArray(entries)) return <p key={i}>Group {name} requires a list. Use the source view.</p>;
          const displayName = layout[name]?.displayName || name;
          const groupScope = `group:${layout[name]?.tab || ""}`;
          const peers = ordered.filter(
            ({ group: peer }) => (layout[Object.keys(peer)[0]]?.tab || "") === (layout[name]?.tab || ""),
          );
          const groupPosition = peers.findIndex(({ i: index }) => index === i);
          const update = (list) => onChange(value.map((g, n) => (n === i ? { [name]: list } : g)));
          const add = () => {
            update([
              ...entries,
              {
                [bookmarks ? "New bookmark" : "New service"]: bookmarks
                  ? [{ href: "https://", icon: "", abbr: "" }]
                  : { href: "https://", description: "", icon: "" },
              },
            ]);
            setNewEntry(`${i}:${entries.length}`);
            setCollapsed({ ...collapsed, [i]: false });
          };
          return (
            <div key={i}>
              {(displayIndex === 0 ||
                layout[Object.keys(ordered[displayIndex - 1].group)[0]]?.tab !== layout[name]?.tab) && (
                <h2 className={styles.tabHeading}>{layout[name]?.tab || "Every tab"}</h2>
              )}
              <section
                className={styles.contentGroup}
                aria-label={name || "Unnamed group"}
                {...ordering.target(groupScope, groupPosition)}
              >
                <div className={styles.groupBar}>
                  <DragHandle {...ordering.handle(groupScope, groupPosition, `group ${name}`, peers.length)} />
                  <button
                    className={styles.groupToggle}
                    type="button"
                    aria-label={`${collapsed[i] ? "Expand" : "Collapse"} group ${name}`}
                    aria-expanded={!collapsed[i]}
                    onClick={() => setCollapsed({ ...collapsed, [i]: !collapsed[i] })}
                  >
                    <span className={collapsed[i] ? styles.closedChevron : undefined}>
                      <GatherIcon name="chevron" />
                    </span>
                    <strong>{displayName || "Unnamed group"}</strong>
                    <span className={styles.contentBadge}>{entries.length}</span>
                  </button>
                  <button
                    type="button"
                    onClick={add}
                    aria-label={`Add ${bookmarks ? "bookmark" : "service"} to ${name}`}
                  >
                    + Add
                  </button>
                  <button
                    type="button"
                    aria-label={`Edit group ${name}`}
                    title="Edit group"
                    onClick={() => setRenaming(renaming === i ? null : i)}
                  >
                    <GatherIcon name="edit" />
                  </button>
                </div>
                {renaming === i && (
                  <div className={styles.contentFields}>
                    <h3>{displayName}</h3>
                    <p>Rename this group in Layout. Its services and connection references stay together.</p>
                    <div className={styles.groupEditActions}>
                      {onEditLayout && (
                        <button type="button" onClick={onEditLayout}>
                          Edit name & layout
                        </button>
                      )}
                      <Move
                        label={name || "group"}
                        index={i}
                        length={value.length}
                        move={(d) => {
                          onChange(reorder(value, i, d));
                          setRenaming(i + d);
                        }}
                        remove={() => {
                          onChange(value.filter((_, n) => n !== i));
                          setRenaming(null);
                        }}
                      />
                    </div>
                    <div className={styles.groupEditFooter}>
                      <button type="button" onClick={() => setRenaming(null)}>
                        Done
                      </button>
                    </div>
                  </div>
                )}
                {!collapsed[i] && (
                  <div className={styles.groupEntries}>
                    {!entries.length && (
                      <p className={styles.emptyGroup}>
                        No {bookmarks ? "bookmarks" : "services"} yet. Add your first one above.
                      </p>
                    )}
                    {entries.map((entry, j) => {
                      const [entryName, config] = Object.entries(entry)[0] || ["", {}];
                      const details = Array.isArray(config) ? config[0] : config;
                      return (
                        <ContentRow
                          key={j}
                          name={entryName || "Unnamed entry"}
                          subtitle={details?.href || details?.description || "No destination set"}
                          icon={details?.icon}
                          kind={bookmarks ? "bookmark" : "grid"}
                          badge={details?.widget ? "widget" : null}
                          open={newEntry === `${i}:${j}`}
                          drag={ordering.handle(`entry:${i}`, j, entryName, entries.length)}
                          drop={ordering.target(`entry:${i}`, j)}
                        >
                          <label>
                            {bookmarks ? "Bookmark name" : "Service name"}
                            <input
                              value={entryName}
                              onChange={(e) =>
                                update(entries.map((x, n) => (n === j ? { [e.target.value]: config } : x)))
                              }
                            />
                          </label>
                          <EntryDetails
                            value={config}
                            bookmarks={bookmarks}
                            onChange={(next) => update(entries.map((x, n) => (n === j ? { [entryName]: next } : x)))}
                          />
                          <Move
                            label={entryName || "entry"}
                            index={j}
                            length={entries.length}
                            move={(d) => {
                              update(reorder(entries, j, d));
                              setNewEntry(null);
                            }}
                            remove={() => {
                              update(entries.filter((_, n) => n !== j));
                              setNewEntry(null);
                            }}
                          />
                        </ContentRow>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          );
        })}
    </div>
  );
}
function OrganizedGroups({ request, ...props }) {
  const [settings, setSettings] = useState({});
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request(null, "settings.yaml")
      .then((doc) => {
        const next = yaml.load(doc.text, { schema: yaml.JSON_SCHEMA });
        if (active) setSettings(next || {});
      })
      .catch(() => {
        if (active) setError("Tab grouping could not be loaded. Groups are shown in configuration order.");
      });
    return () => {
      active = false;
    };
  }, [request]);
  return (
    <>
      {error && <p role="status">{error}</p>}
      <Groups {...props} layout={settings.layout || {}} tabs={dashboardTabs(settings)} />
    </>
  );
}
function PersonalIntegration({ value, onChange, request }) {
  const { data } = useSWR(["personal-integration-catalog", request], () => request(null, "shared-services"));
  const services = data?.services || [];
  return (
    <label>
      Shared integration
      <select
        value={value.gatherSharedService ? JSON.stringify(value.gatherSharedService) : ""}
        onChange={(event) => {
          const next = { ...value };
          if (event.target.value) next.gatherSharedService = JSON.parse(event.target.value);
          else delete next.gatherSharedService;
          onChange(next);
        }}
      >
        <option value="">No integration</option>
        {services.map((service) => (
          <option key={JSON.stringify(service)} value={JSON.stringify(service)}>
            {service.group} / {service.name}
          </option>
        ))}
      </select>
      <small>Use data from a shared service. Credentials remain in server settings.</small>
    </label>
  );
}
function EntryDetails({ value, onChange, bookmarks }) {
  const personal = useContext(PersonalEditorContext);
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
        let favicon = "";
        try {
          const destination = new URL(link.href);
          if (["https:", "http:"].includes(destination.protocol) && !destination.username && !destination.password)
            favicon = new URL("/favicon.ico", destination.origin).href;
        } catch {}
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
                      type={key === "href" && !link.href?.startsWith("/") ? "url" : "text"}
                      value={link[key] || ""}
                      onChange={(e) => update({ ...link, [key]: e.target.value })}
                    />
                  </label>
                ),
              )}
            </div>
            {bookmarks && (
              <div className={styles.faviconChoice}>
                <button type="button" disabled={!favicon} onClick={() => update({ ...link, icon: favicon })}>
                  Use website favicon
                </button>
                <p>
                  Loads the icon from this site’s /favicon.ico address. If the site uses a different path, choose an
                  icon or upload one.
                </p>
              </div>
            )}
            {!bookmarks && link.vcenterServer && (
              <section className={styles.notice}>
                <p>
                  vCenter: {link.vcenterServer} ·{" "}
                  {link.vcenterHost
                    ? "Linked ESXi host with health and resource metrics"
                    : link.vcenterVM
                      ? "Linked VM with power status, live utilization and allocated resources"
                      : "Inventory summary"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const next = { ...link };
                    delete next.vcenterServer;
                    delete next.vcenterVM;
                    delete next.vcenterHost;
                    delete next.vcenterSummary;
                    update(next);
                  }}
                >
                  Remove vCenter link
                </button>
                <p>The service card and its URL are kept.</p>
              </section>
            )}
            {!bookmarks && personal && (
              <PersonalIntegration value={link} onChange={update} request={personal.request} />
            )}
            {!bookmarks && !personal && (
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
            role="region"
            aria-label="Appearance preview"
            className={styles.appearancePreview}
            data-theme={value.theme || "system"}
            style={{
              "--preview-light": themes[value.color]?.light || themes.slate.light,
              "--preview-dark": themes[value.color]?.dark || themes.slate.dark,
            }}
          >
            <div>
              {value.favicon ? (
                // eslint-disable-next-line @next/next/no-img-element -- Preview supports uploaded icons.
                <img className={styles.mark} src={iconURL(value.favicon)} alt="Dashboard icon" />
              ) : (
                <GatherMark className={styles.mark} />
              )}
              <strong>{value.title || "Gather"}</strong>
              <span>APPEARANCE PREVIEW</span>
            </div>
            <div className={styles.previewTabs}>
              {dashboardTabs(value).map((tab, index) =>
                index === 0 ? <b key={tab}>{tab}</b> : <span key={tab}>{tab}</span>,
              )}
            </div>
            <h3>Welcome home.</h3>
            <p>{value.description || "Your everyday, together."}</p>
            <div className={styles.previewCards}>
              {(Object.keys(value.layout || {}).length
                ? Object.keys(value.layout)
                : ["Your services", "Your favorites", "At a glance"]
              )
                .slice(0, 3)
                .map((group) => (
                  <span key={group}>{group}</span>
                ))}
            </div>
          </div>
          <p className={styles.sourceHint}>
            Title, icon, theme and color update as you edit. Service content is illustrative; save to apply changes to
            your dashboard.
          </p>
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
      {view === "tabs" && <Tabs value={value} onChange={onChange} />}
      {view === "layout" && (
        <Layout
          request={request}
          tabs={dashboardTabs(value)}
          value={value.layout || {}}
          onChange={(next) => set("layout", next)}
        />
      )}
    </>
  );
}
function Tabs({ value, onChange }) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null);
  const tabs = dashboardTabs(value);
  const clean = name.trim();
  const duplicate = tabs.some((tab) => tab !== editing && slugifyAndEncode(tab) === slugifyAndEncode(clean));
  const valid = clean && clean.length <= 80 && slugifyAndEncode(clean) && !duplicate;
  return (
    <section className={styles.card}>
      <h2>Dashboard tabs</h2>
      <p>Groups are assigned in Layout. Removing a tab keeps its groups and shows them on every tab.</p>
      {tabs.map((tab, index) => (
        <div className={styles.heading} key={tab}>
          <strong>{tab}</strong>
          <div className={styles.moves}>
            <button
              type="button"
              aria-label={`Rename ${tab}`}
              onClick={() => {
                setEditing(tab);
                setName(tab);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              aria-label={`Move ${tab} up`}
              disabled={index === 0}
              onClick={() => onChange({ ...value, gather: { ...value.gather, tabs: reorder(tabs, index, -1) } })}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${tab} down`}
              disabled={index === tabs.length - 1}
              onClick={() => onChange({ ...value, gather: { ...value.gather, tabs: reorder(tabs, index, 1) } })}
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Remove tab ${tab}`}
              onClick={() => {
                onChange(renameDashboardTab(value, tab, ""));
                if (editing === tab) {
                  setEditing(null);
                  setName("");
                }
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <label>
        {editing ? "New tab name" : "Tab name"}
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </label>
      {duplicate && <p role="alert">A tab with that name or URL already exists.</p>}
      <button
        type="button"
        disabled={!valid}
        onClick={() => {
          onChange(
            editing
              ? renameDashboardTab(value, editing, clean)
              : { ...value, gather: { ...value.gather, tabs: [...tabs, clean] } },
          );
          setName("");
          setEditing(null);
        }}
      >
        {editing ? "Save tab name" : "Add tab"}
      </button>
      {editing && (
        <button
          type="button"
          onClick={() => {
            setName("");
            setEditing(null);
          }}
        >
          Cancel rename
        </button>
      )}
    </section>
  );
}
function Layout({ value, onChange, request, tabs }) {
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
            <h2>{options?.displayName || group}</h2>
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
          <label>
            Group name
            <input
              aria-label={`Group name for ${group}`}
              maxLength={120}
              required
              value={options?.displayName ?? group}
              onChange={(e) => update(group, { displayName: e.target.value })}
            />
          </label>
          <div className={styles.grid}>
            <label>
              Tab
              <select value={options?.tab || ""} onChange={(e) => update(group, { tab: e.target.value })}>
                <option value="">Every tab</option>
                {tabs.map((tab) => (
                  <option key={tab}>{tab}</option>
                ))}
              </select>
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
              onChange({ ...value, [name.trim()]: { tab: tabs[0] || "", style: "row", columns: 3 } });
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
  const personal = useContext(PersonalEditorContext);
  const [library, setLibrary] = useState(false);
  const ordering = useOrdering((scope, from, to) => onChange(moveTo(value, from, to)));
  if (!Array.isArray(value)) return <p>Use Source to repair this widget list.</p>;
  return (
    <section className={styles.contentGroup}>
      <div className={styles.widgetToolbar}>
        <div>
          <span className={styles.orderAnnouncement} role="status">
            {ordering.announcement}
          </span>
          <h2>
            Your Home widgets <span className={styles.contentBadge}>{value.length}</span>
          </h2>
          <p>Drag the handles to arrange your Home widgets.</p>
        </div>
        <button type="button" onClick={() => setLibrary(!library)}>
          {library ? "Close library" : "Add Home widget"}
        </button>
      </div>
      {library && (
        <Catalog
          title="Home widget library"
          items={
            personal
              ? HOME_WIDGETS.filter((item) => ["greeting", "search", "datetime", "openmeteo", "logo"].includes(item.id))
              : HOME_WIDGETS
          }
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
          <ContentRow
            key={index}
            name={item?.name || pretty(type || "Widget")}
            subtitle={item?.description || `Position ${index + 1} on Home`}
            kind={
              type === "search" ? "search" : type === "datetime" ? "history" : type === "greeting" ? "person" : "home"
            }
            badge="widget"
            drag={ordering.handle("widgets", index, item?.name || type, value.length)}
            drop={ordering.target("widgets", index)}
          >
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
              label={item?.name || type || "widget"}
              index={index}
              length={value.length}
              move={(direction) => onChange(reorder(value, index, direction))}
              remove={() => onChange(value.filter((_, i) => i !== index))}
            />
          </ContentRow>
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
export default function SettingsEditor({ request = api, preview = false, personal = false }) {
  const sections = personal ? SECTIONS.filter((item) => PERSONAL_SECTIONS.includes(item.id)) : SECTIONS;
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
  const rawOnly = file.endsWith(".css") || file.endsWith(".js") || CONNECTION_FILES.includes(file);
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
  const load = async (id, backupFile = file) => {
    if (["system", "variables", "migration", "users"].includes(id)) {
      setSection(id);
      setText(doc?.text || "");
      setStatus("");
      setError("");
      return;
    }
    const next = id === "backups" ? backupFile : SECTIONS.find((item) => item.id === id).file;
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
            ? personal
              ? "Saved to your dashboard."
              : "Saved and applied. The previous version is available in Backup & restore."
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
    if (!["system", "variables", "migration", "users"].includes(section) && item.file === file) {
      setSection(item.id);
      return;
    }
    if (dirty || systemDirty) setPending(item.id);
    else load(item.id);
  }
  return (
    <PersonalEditorContext.Provider value={personal ? { request } : null}>
      <EditorPreviewContext.Provider value={preview}>
        <main className={styles.editor}>
          <Head>
            <title>Gather settings</title>
          </Head>
          <header className={styles.top}>
            <div className={styles.brand}>
              {/* Full navigation keeps the unsaved-edit warning. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a href="/" aria-label="Gather home" className={styles.brand}>
                <GatherMark className={styles.mark} />
                <strong>Gather</strong>
              </a>
              <span>/</span>
              <span>Settings</span>
            </div>
            {/* Full navigation preserves the unsaved-edit beforeunload warning. */}
            <a href={personal ? "/?dashboard=mine" : "/"} className={styles.back}>
              <GatherIcon name="arrowLeft" /> Back to dashboard
            </a>
          </header>
          <div className={styles.shell}>
            <aside className={styles.sidebar}>
              <div className={styles.sidebarTitle}>
                <h1>{personal ? "My dashboard settings" : "Dashboard settings"}</h1>
                <p>A little more you.</p>
              </div>
              <nav aria-label="Settings sections">
                {[
                  ...new Set(
                    sections
                      .filter((item) => (!item.protected && item.id !== "system") || canManageSystem)
                      .map((item) => item.group),
                  ),
                ].map((group) => (
                  <div key={group} className={styles.navGroup}>
                    <span className={styles.eyebrow}>{group}</span>
                    {sections
                      .filter(
                        (item) =>
                          item.group === group && ((!item.protected && item.id !== "system") || canManageSystem),
                      )
                      .map((item) => (
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
                      ))}
                  </div>
                ))}
              </nav>
              {!personal && (
                <div className={styles.sidebarTools}>
                  <button disabled={busy} onClick={checks}>
                    <GatherIcon name="check" /> Check connections
                  </button>
                </div>
              )}
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
                  Ask the server operator to enable GATHER_EDITOR_ENABLED and authorize your account’s stable identity
                  in GATHER_ADMIN_IDS.
                </p>
              )}
              {!doc && busy && <p role="status">Loading settings…</p>}
              {section === "system" && canManageSystem && (
                <SystemSettings embedded preview={preview} onDirtyChange={setSystemDirty} titleRef={sectionTitle} />
              )}
              {doc && section === "users" && (
                <Users preview={preview} titleRef={sectionTitle} onDirtyChange={setSystemDirty} />
              )}
              {doc && section === "variables" && (
                <Variables preview={preview} titleRef={sectionTitle} onDirtyChange={setSystemDirty} />
              )}
              {doc && section === "migration" && (
                <Migration
                  canManageConnections={canManageSystem}
                  request={request}
                  titleRef={sectionTitle}
                  onDirtyChange={setSystemDirty}
                />
              )}
              {doc && !["system", "users", "variables", "migration"].includes(section) && (
                <>
                  <div className={styles.heading}>
                    <div>
                      <h2 ref={sectionTitle} tabIndex={-1} className={styles.sectionTitle}>
                        {current.label}
                      </h2>
                      <p>{current.description}</p>
                    </div>
                    {section !== "backups" && !rawOnly && (
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
                  {section !== "backups" && (
                    <>
                      <fieldset ref={formRef} disabled={busy} className={styles.form}>
                        {rawOnly || mode === "source" ? (
                          <>
                            <p>
                              {CONNECTION_FILES.includes(file)
                                ? "Connection settings stay on the server. Use secrets or environment placeholders for credentials; save to update the configured connection."
                                : rawOnly
                                  ? "Custom code changes dashboard behavior for visitors. JavaScript runs with their signed-in access; only save code you trust."
                                  : "Environment placeholders are preserved. Resolved environment secrets are never loaded into this editor."}
                            </p>
                            {file === "vcenter.yaml" && (
                              <Vcenter preview={preview} request={request} connectionsDirty={dirty} />
                            )}
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
                              <OrganizedGroups
                                onEditLayout={() => selectSection(SECTIONS.find((item) => item.id === "layout"))}
                                request={request}
                                value={value}
                                onChange={change}
                                bookmarks={file === "bookmarks.yaml"}
                              />
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
                            {preview
                              ? "This preview stays in your browser"
                              : personal
                                ? "Changes apply only to your dashboard"
                                : "A backup is created with every save"}
                          </small>
                        </span>
                        <button disabled={busy} onClick={() => save("validate")}>
                          Validate
                        </button>
                        <button disabled={busy || !dirty} className={styles.primary} onClick={() => save()}>
                          Save & apply
                        </button>
                        <button
                          disabled={busy || !dirty}
                          onClick={resetChanges}
                          title={`Reset unsaved changes in ${file}`}
                        >
                          Reset changes
                        </button>
                      </div>
                    </>
                  )}
                  {section === "backups" && (
                    <section className={styles.card}>
                      <label>
                        Configuration to restore
                        <select value={file} disabled={busy} onChange={(e) => load("backups", e.target.value)}>
                          {[
                            ...new Set(
                              sections
                                .filter((item) => !item.protected || canManageSystem)
                                .map((item) => item.file)
                                .filter(Boolean),
                            ),
                          ].map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <h3>Saved versions</h3>
                      <p>
                        Restore a previous version of this section. Restoring also backs up the current version. The
                        most recent 50 backups are listed.
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
                    </section>
                  )}
                  <p className={styles.hint}>
                    {personal
                      ? "Your dashboard is saved separately from the shared dashboard."
                      : "Visual edits preserve your configuration values and placeholders. YAML formatting and comments may be normalized; previous versions are available in Backup & restore."}
                  </p>
                </>
              )}
            </div>
          </div>
        </main>
      </EditorPreviewContext.Provider>
    </PersonalEditorContext.Provider>
  );
}
