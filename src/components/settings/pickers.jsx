/* eslint-disable @next/next/no-img-element -- Native images also support local preview uploads and authenticated assets. */
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

import styles from "./editor.module.css";
import { fieldError, isConfigReference } from "./field-validation";
import integrations from "./widget-catalog.json";

export const EditorPreviewContext = createContext(false);
export const SERVICE_WIDGETS = integrations;
const label = (key) =>
  ({
    url: "Server URL",
    _blank: "New tab",
    _self: "Same tab",
    metric: "Metric (°C)",
    imperial: "Imperial (°F)",
    key: "API key / access token",
    username: "Username",
    password: "Password",
    fields: "Display fields",
    text_size: "Text size",
    cputemp: "CPU temperature",
    weatherapi: "WeatherAPI",
  })[key] ||
  key
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
const services = [
  "home-assistant",
  "plex",
  "jellyfin",
  "emby",
  "sonarr",
  "radarr",
  "prowlarr",
  "sabnzbd",
  "transmission",
  "qbittorrent",
  "nextcloud",
  "immich",
  "mealie",
  "paperless-ngx",
  "vaultwarden",
  "bitwarden",
  "gitea",
  "github",
  "gitlab",
  "docker",
  "portainer",
  "proxmox",
  "truenas",
  "unraid",
  "synology",
  "grafana",
  "prometheus",
  "uptime-kuma",
  "adguard-home",
  "pi-hole",
  "unifi",
  "tailscale",
  "wireguard",
  "nginx-proxy-manager",
  "traefik",
  "cloudflare",
  "authentik",
  "authelia",
  "keycloak",
  "ntfy",
  "gotify",
  "frigate",
  "esphome",
  "zigbee2mqtt",
  "node-red",
  "mosquitto",
  "homebridge",
  "syncthing",
  "bookstack",
  "calibre-web",
];
const symbols = [
  "home",
  "server",
  "network",
  "wifi",
  "cloud",
  "folder",
  "bookmark",
  "music",
  "movie",
  "camera",
  "database",
  "shield-check",
  "lock",
  "bell",
  "lightbulb",
  "weather-partly-cloudy",
  "bitcoin",
  "heart",
  "cog",
  "chart-line",
];
const iconTags = {
  media: "plex jellyfin emby sonarr radarr prowlarr sabnzbd transmission qbittorrent calibre-web music movie",
  "home automation smart iot": "home-assistant esphome zigbee2mqtt node-red mosquitto homebridge lightbulb",
  "network internet":
    "adguard-home pi-hole unifi tailscale wireguard nginx-proxy-manager traefik cloudflare network wifi",
  "vpn remote access": "tailscale wireguard",
  "dns filtering": "adguard-home pi-hole cloudflare",
  "homeassistant hass hassio": "home-assistant",
  pihole: "pi-hole",
  "security authentication identity passwords": "vaultwarden bitwarden authentik authelia keycloak shield-check lock",
  "storage files backup sync": "nextcloud syncthing truenas unraid synology folder database",
  "monitoring metrics status": "grafana prometheus uptime-kuma chart-line",
  "server containers infrastructure": "docker portainer proxmox server cloud",
  "development code git": "gitea github gitlab",
  "notifications alerts": "ntfy gotify bell",
  "photos camera surveillance": "immich frigate camera",
  "documents books knowledge": "paperless-ngx bookstack calibre-web",
  "food recipes cooking": "mealie",
  "weather forecast": "weather-partly-cloudy",
  "finance cryptocurrency": "bitcoin",
  "favorites saved": "bookmark heart",
  "settings configuration": "cog",
};
const tagsFor = (name) =>
  Object.entries(iconTags)
    .filter(([, names]) => names.split(" ").includes(name))
    .map(([tags]) => tags)
    .join(" ");
const ICONS = [
  ...services.map((name) => ({ name: label(name.replaceAll("-", " ")), value: `${name}.png`, tags: tagsFor(name) })),
  ...symbols.map((name) => ({ name: label(name.replaceAll("-", " ")), value: `mdi-${name}`, tags: tagsFor(name) })),
];
export function matchesIcon(item, query) {
  const normalize = (text) =>
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const haystack = normalize([item.name, item.value, item.tags || ""].join(" "));
  return normalize(query)
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
export function iconURL(value) {
  if (!value) return "";
  if (/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|webp);base64,)/i.test(value)) return value;
  if (value.startsWith("mdi-")) return `https://cdn.jsdelivr.net/npm/@mdi/svg@latest/svg/${value.slice(4)}.svg`;
  if (value.startsWith("si-")) return `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${value.slice(3)}.svg`;
  if (value.startsWith("sh-"))
    return `https://cdn.jsdelivr.net/gh/selfhst/icons@main/png/${value.slice(3).replace(/\.(png|svg|webp)$/, "")}.png`;
  const extension = value.match(/\.(svg|webp)$/)?.[1] || "png";
  return `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/${extension}/${value.replace(/\.(png|svg|webp)$/, "")}.${extension}`;
}
export function IconPicker({ value = "", onChange, title = "Icon", localOnly = false }) {
  const preview = useContext(EditorPreviewContext);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [uploads, setUploads] = useState([]);
  const id = useId();
  const trigger = useRef(null),
    search = useRef(null);
  useEffect(() => {
    if (open) search.current?.focus();
  }, [open]);
  const closeLibrary = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  async function browse() {
    setOpen(!open);
    if (!open && !preview) {
      try {
        const response = await fetch("/api/gather/icons", { credentials: "same-origin" });
        if (response.ok)
          setUploads((await response.json()).icons.map((url, i) => ({ value: url, name: `Uploaded icon ${i + 1}` })));
      } catch {
        /* The bundled library remains usable offline. */
      }
    }
  }
  async function upload(file) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 1024 * 1024) {
      setError("Choose a PNG, JPEG or WebP image up to 1 MB.");
      return;
    }
    setBusy(true);
    try {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      let url = data;
      if (!preview) {
        const response = await fetch("/api/gather/icons", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
          body: JSON.stringify({ image: data }),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || "Upload failed. Try another image.");
        url = result.url;
      }
      setUploads((items) => [...items, { name: file.name, value: url }]);
      onChange(url);
      closeLibrary();
    } catch (e) {
      setError(e.message || "Could not read this image.");
    } finally {
      setBusy(false);
    }
  }
  const items = [
    ...(localOnly ? [{ name: "Gather", value: "/android-chrome-512x512.png" }] : ICONS),
    ...uploads,
  ].filter((item) => matchesIcon(item, query));
  return (
    <div className={styles.iconPicker}>
      <span id={id}>{title}</span>
      <div className={styles.iconChoice}>
        {value ? (
          <img
            className={/^(mdi|si)-/.test(value) ? styles.symbolIcon : undefined}
            src={iconURL(value)}
            alt="Selected icon"
            width="36"
            height="36"
          />
        ) : (
          <span className={styles.iconPlaceholder}>◇</span>
        )}
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-label={`Choose ${title.toLowerCase()}`}
          onClick={browse}
        >
          {value ? "Change icon" : "Choose icon"}
        </button>
        {value && (
          <button type="button" aria-label={`Remove ${title.toLowerCase()}`} onClick={() => onChange("")}>
            Clear
          </button>
        )}
      </div>
      {open && (
        <section
          className={styles.library}
          aria-labelledby={id}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeLibrary();
            }
          }}
        >
          <div className={styles.heading}>
            <strong>Icon library</strong>
            <button type="button" onClick={closeLibrary}>
              Close library
            </button>
          </div>
          <label>
            Search icons
            <input
              type="search"
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search names, filenames or tags, like media or VPN"
            />
          </label>
          <div className={styles.iconGrid}>
            {items.map((item) => (
              <button
                key={item.value}
                type="button"
                aria-pressed={value === item.value}
                onClick={() => {
                  onChange(localOnly ? iconURL(item.value) : item.value);
                  closeLibrary();
                }}
              >
                <img
                  className={/^(mdi|si)-/.test(item.value) ? styles.symbolIcon : undefined}
                  src={iconURL(item.value)}
                  alt=""
                  width="32"
                  height="32"
                  loading="lazy"
                />
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <p role="status">
            {items.length ? `${items.length} icons found` : "No matching icons. Try another search or upload your own."}
          </p>
          <label className={styles.upload}>
            Upload an icon
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={(e) => {
                upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <small>PNG, JPEG or WebP · up to 1 MB{preview ? " · preview only" : ""}</small>
          </label>
        </section>
      )}
      {busy && <p role="status">Uploading icon…</p>}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
export function Catalog({ items, title, onSelect }) {
  const [query, setQuery] = useState("");
  const found = items.filter((item) =>
    `${item.name} ${item.id} ${item.description || ""}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className={styles.library}>
      <h3>{title}</h3>
      <label>
        Search widgets
        <input type="search" placeholder="Find a widget…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className={styles.catalog}>
        {found.map((item) => (
          <button type="button" key={item.id} onClick={() => onSelect(item)}>
            <strong>{item.name}</strong>
            <small>{item.description || "Connect your service"}</small>
            <span>Add widget →</span>
          </button>
        ))}
      </div>
      {!found.length && <p>No matching widgets.</p>}
    </section>
  );
}
export function GuidedFields({ fields, value, onChange }) {
  return (
    <div className={styles.grid}>
      {fields.map(({ key, kind = "text", options, min, max, step, required, validation, error, title, help }) => {
        const parts = key.split(".");
        const current = parts.reduce((v, part) => v?.[part], value);
        const set = (next) => {
          const copy = { ...value };
          let target = copy;
          parts.slice(0, -1).forEach((part) => {
            target[part] = { ...target[part] };
            target = target[part];
          });
          if (next === "") delete target[parts.at(-1)];
          else target[parts.at(-1)] = next;
          onChange(copy);
        };
        if (
          kind === "list" &&
          (current === undefined || (Array.isArray(current) && current.every((entry) => typeof entry === "string")))
        )
          return (
            <fieldset key={key}>
              <legend>{title || label(key)}</legend>
              {[...new Set([...options, ...(current || [])])].map((option) => (
                <label key={option} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={current?.includes(option) || false}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...(current || []), option]
                        : current.filter((entry) => entry !== option);
                      set(next.length ? next : "");
                    }}
                  />
                  {label(option)}
                </label>
              ))}
              {help && <small>{help}</small>}
            </fieldset>
          );
        if (current !== undefined && current !== null && typeof current === "object")
          return <p key={key}>{title || label(key)} uses a custom configuration. Edit it in Source.</p>;
        return (
          <label key={key} className={kind === "boolean" ? styles.check : undefined}>
            {kind !== "boolean" && (title || label(key))}
            {options ? (
              <select required={required} value={current ?? ""} onChange={(e) => set(e.target.value)}>
                <option value="">Default</option>
                {current && !options.includes(current) && <option value={current}>{current} (custom)</option>}
                {options.map((option) => (
                  <option key={option} value={option}>
                    {label(option)}
                  </option>
                ))}
              </select>
            ) : kind === "boolean" ? (
              <>
                <input type="checkbox" checked={current === true} onChange={(e) => set(e.target.checked)} />
                {title || label(key)}
              </>
            ) : (
              <input
                type={kind === "url" && isConfigReference(current) ? "text" : kind}
                value={current ?? ""}
                min={min}
                max={max}
                step={kind === "number" ? (step ?? "any") : undefined}
                required={required}
                ref={(node) => node?.setCustomValidity(error || fieldError(current, validation))}
                autoComplete={kind === "password" ? "new-password" : "off"}
                onChange={(e) =>
                  set(kind === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)
                }
              />
            )}
            {help && <small>{help}</small>}
          </label>
        );
      })}
    </div>
  );
}
export function IntegrationPicker({ value, onChange }) {
  const [choosing, setChoosing] = useState(false),
    [replacement, setReplacement] = useState(null);
  const item = integrations.find((entry) => entry.id === value?.type);
  function select(next) {
    if (value?.type) setReplacement(next);
    else {
      onChange({ type: next.id });
      setChoosing(false);
    }
  }
  return (
    <section className={styles.integration}>
      <div className={styles.heading}>
        <div>
          <h3>{item?.name || value?.type || "Connect a widget"}</h3>
          <p>Show live information from this service.</p>
        </div>
        <button type="button" onClick={() => setChoosing(!choosing)}>
          {choosing ? "Close library" : value?.type ? "Change widget" : "Choose integration widget"}
        </button>
      </div>
      {choosing && <Catalog title="Integration library" items={integrations} onSelect={select} />}
      {replacement && (
        <div role="alert" className={styles.notice}>
          <p>Replace this widget with {replacement.name}? Its current connection settings will be removed.</p>
          <button
            type="button"
            onClick={() => {
              onChange({ type: replacement.id });
              setReplacement(null);
              setChoosing(false);
            }}
          >
            Replace widget
          </button>
          <button type="button" onClick={() => setReplacement(null)}>
            Cancel
          </button>
        </div>
      )}
      {value?.type && (
        <>
          <GuidedFields fields={item?.fields || []} value={value} onChange={onChange} />
          {value.type === "calendar" && <CalendarSources value={value} onChange={onChange} />}
          <p className={styles.sourceHint}>
            Additional options are available in Source.
            {item?.doc && (
              <>
                {" "}
                <a
                  href={item.docUrl || `https://gethomepage.dev/widgets/services/${item.doc}/`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Setup guide ↗
                </a>
              </>
            )}
          </p>
        </>
      )}
      {value && (
        <button type="button" onClick={() => onChange(null)}>
          Remove widget
        </button>
      )}
    </section>
  );
}
const CALENDAR_SOURCE_TYPES = ["ical", "sonarr", "radarr", "lidarr", "readarr"];
const CALENDAR_COLORS = [
  "amber",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "neutral",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
  "teal",
  "violet",
  "white",
  "yellow",
  "zinc",
];
export function CalendarSources({ value, onChange }) {
  const [type, setType] = useState("ical");
  const sources = value.integrations ?? [];
  if (!Array.isArray(sources)) return <p>Event sources use a custom configuration. Edit them in Source.</p>;
  const update = (next) => onChange({ ...value, integrations: next });
  return (
    <section className={styles.contentGroup}>
      <h4>Event sources</h4>
      <p>
        iCal uses a feed URL. Media sources reuse an existing service widget’s connection and credentials; enter its
        exact group and service name.
      </p>
      {sources.map((source, index) => (
        <fieldset key={index}>
          <legend>
            Event source {index + 1}: {source?.type || "custom"}
          </legend>
          {CALENDAR_SOURCE_TYPES.includes(source?.type) ? (
            <GuidedFields
              value={source}
              onChange={(next) => update(sources.map((entry, i) => (i === index ? next : entry)))}
              fields={[
                ...(source.type === "ical"
                  ? [
                      {
                        key: "name",
                        title: "Feed name",
                        required: true,
                        error: sources.some((entry, i) => i !== index && entry?.name === source.name && source.name)
                          ? "Feed names must be unique within this calendar."
                          : "",
                      },
                      {
                        key: "url",
                        title: "iCal feed URL",
                        kind: "password",
                        required: true,
                        validation: "http",
                        help: "HTTP(S) feed URL or an unresolved variable reference. Private feed links are credentials; use a stored variable when possible.",
                      },
                      { key: "params.showName", kind: "boolean", title: "Show feed name before events" },
                    ]
                  : [
                      { key: "service_group", title: "Service group", required: true },
                      { key: "service_name", title: "Service name", required: true },
                      {
                        key: "baseUrl",
                        title: "Event link base URL",
                        kind: "url",
                        validation: "http",
                        help: "Optional link to the media application.",
                      },
                      { key: "params.unmonitored", kind: "boolean", title: "Include unmonitored items" },
                      ...(source.type === "radarr"
                        ? [{ key: "missingOnly", kind: "boolean", title: "Only missing monitored movies" }]
                        : []),
                    ]),
                { key: "color", options: CALENDAR_COLORS, title: "Event color" },
              ]}
            />
          ) : (
            <p>This source is preserved. Edit its custom configuration in Source.</p>
          )}
          <button type="button" onClick={() => update(sources.filter((_, i) => i !== index))}>
            Remove event source {index + 1}
          </button>
        </fieldset>
      ))}
      <div className={styles.add}>
        <label>
          Source type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {CALENDAR_SOURCE_TYPES.map((entry) => (
              <option key={entry} value={entry}>
                {entry === "ical" ? "iCal feed" : label(entry)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => update([...sources, { type }])}>
          Add event source
        </button>
      </div>
    </section>
  );
}

export const HOME_WIDGETS = [
  {
    id: "greeting",
    name: "Greeting",
    description: "A personal welcome on Home",
    defaults: { text: "Welcome home.", personalize: true },
    fields: [
      { key: "text", title: "Greeting" },
      { key: "personalize", kind: "boolean", title: "Include your first name" },
    ],
  },
  {
    id: "search",
    name: "Search",
    description: "Search the web from your dashboard",
    defaults: { provider: "google", target: "_blank" },
    fields: [
      { key: "provider", options: ["google", "duckduckgo", "bing", "baidu", "brave", "custom"] },
      { key: "target", options: ["_blank", "_self"] },
      { key: "showSearchSuggestions", kind: "boolean" },
    ],
  },
  {
    id: "datetime",
    name: "Date & time",
    description: "Your local date and clock",
    defaults: { text_size: "xl", format: { dateStyle: "long", timeStyle: "short" } },
    fields: [
      { key: "text_size", options: ["xs", "sm", "md", "xl", "2xl", "3xl", "4xl"] },
      { key: "format.dateStyle", title: "Date format", options: ["short", "medium", "long", "full"] },
      { key: "format.timeStyle", title: "Time format", options: ["short", "medium", "long", "full"] },
    ],
  },
  {
    id: "openmeteo",
    name: "Weather",
    description: "Local forecast · no API key needed",
    defaults: { label: "Weather", units: "metric" },
    fields: [
      { key: "label", title: "Location name" },
      { key: "latitude", kind: "number", min: -90, max: 90 },
      { key: "longitude", kind: "number", min: -180, max: 180 },
      { key: "units", options: ["metric", "imperial"] },
    ],
  },
  {
    id: "weatherapi",
    name: "WeatherAPI",
    description: "Current weather with your WeatherAPI key",
    defaults: { units: "metric", provider: "weatherapi" },
    fields: [
      { key: "label", title: "Location name" },
      { key: "latitude", kind: "number", min: -90, max: 90 },
      { key: "longitude", kind: "number", min: -180, max: 180 },
      { key: "units", options: ["metric", "imperial"] },
      {
        key: "provider",
        title: "Shared key provider",
        options: ["weatherapi"],
        help: "Select WeatherAPI to use the operator’s shared provider key when the widget key is blank.",
      },
      {
        key: "apiKey",
        kind: "password",
        title: "WeatherAPI key",
        help: "API key or an unresolved variable reference. Blank uses the shared key when the WeatherAPI provider is selected.",
      },
      { key: "cache", kind: "number", min: 1, step: 1, title: "Cache duration (minutes)", help: "Default: 5 minutes." },
      {
        key: "format.maximumFractionDigits",
        kind: "number",
        min: 0,
        max: 20,
        step: 1,
        title: "Temperature decimal places",
      },
    ],
  },
  {
    id: "resources",
    name: "Resources",
    description: "CPU, memory and uptime",
    defaults: { cpu: true, memory: true },
    fields: [
      { key: "cpu", kind: "boolean", title: "CPU usage" },
      { key: "memory", kind: "boolean" },
      { key: "uptime", kind: "boolean" },
      { key: "cputemp", kind: "boolean" },
      { key: "units", options: ["metric", "imperial"] },
    ],
  },
];

export function TokenList({ title, values, onChange, pattern = "^.+$", placeholder = "Add an item", limit = 100 }) {
  const [draft, setDraft] = useState("");
  const valid = new RegExp(pattern).test(draft.trim()) && !values.includes(draft.trim()) && values.length < limit;
  function add() {
    if (valid) {
      onChange([...values, draft.trim()]);
      setDraft("");
    }
  }
  return (
    <div className={styles.tokenList}>
      <strong>{title}</strong>
      <div className={styles.tokens}>
        {values.map((value) => (
          <span key={value}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className={styles.add}>
        <input
          aria-label={title}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" disabled={!valid} onClick={add}>
          Add
        </button>
      </div>
      {draft && !valid && <small>Use a unique, valid name{values.length >= limit ? ` (maximum ${limit})` : ""}.</small>}
    </div>
  );
}

HOME_WIDGETS.push(
  { id: "logo", name: "Logo", description: "Your own mark on Home", defaults: {}, fields: [] },
  {
    id: "glances",
    name: "Glances",
    description: "Monitor a remote host",
    defaults: { cpu: true, mem: true },
    fields: [
      { key: "url", kind: "url" },
      { key: "username" },
      { key: "password", kind: "password" },
      { key: "version", options: ["3", "4"] },
      { key: "cpu", kind: "boolean" },
      { key: "mem", kind: "boolean", title: "Memory" },
      { key: "uptime", kind: "boolean" },
    ],
  },
  {
    id: "unifi_console",
    name: "UniFi Controller",
    description: "Network connectivity at a glance",
    defaults: {},
    fields: [
      { key: "url", kind: "url" },
      { key: "site" },
      { key: "username" },
      { key: "password", kind: "password" },
      { key: "key", kind: "password", help: "Use an API key or a local username and password." },
    ],
  },
  {
    id: "openweathermap",
    name: "OpenWeatherMap",
    description: "Weather with your OpenWeatherMap key",
    defaults: { units: "metric", provider: "openweathermap" },
    fields: [
      { key: "label", title: "Location name" },
      { key: "latitude", kind: "number", min: -90, max: 90 },
      { key: "longitude", kind: "number", min: -180, max: 180 },
      { key: "units", options: ["metric", "imperial"] },
      { key: "apiKey", kind: "password" },
    ],
  },
  {
    id: "kubernetes",
    name: "Kubernetes",
    description: "Cluster and node resource usage",
    defaults: { cluster: { show: true, cpu: true, memory: true }, nodes: { show: false } },
    fields: [
      { key: "cluster.show", kind: "boolean", title: "Show cluster" },
      { key: "cluster.cpu", kind: "boolean", title: "Cluster CPU" },
      { key: "cluster.memory", kind: "boolean", title: "Cluster memory" },
      { key: "nodes.show", kind: "boolean", title: "Show nodes" },
    ],
  },
  {
    id: "longhorn",
    name: "Longhorn",
    description: "Storage usage · provider configured in Source",
    defaults: { total: true, nodes: true, labels: true },
    fields: [
      { key: "total", kind: "boolean", title: "Total storage" },
      { key: "nodes", kind: "boolean", title: "Show nodes" },
      { key: "labels", kind: "boolean", title: "Show labels" },
      { key: "expanded", kind: "boolean" },
    ],
  },
  {
    id: "stocks",
    name: "Stocks",
    description: "Watchlist · Finnhub key configured in Source",
    defaults: { provider: "finnhub", color: true, watchlist: [] },
    fields: [{ key: "color", kind: "boolean", title: "Color price changes" }],
  },
);
