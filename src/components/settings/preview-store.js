import * as yaml from "js-yaml";

// Browser-local fixtures. No credentials, live endpoints, or server-side writes.
export function createPreviewStore() {
  const fixtures = {
    "docker.yaml": {},
    "kubernetes.yaml": { mode: "disabled" },
    "vcenter.yaml": {},
    "proxmox.yaml": {},
    "settings.yaml": {
      title: "Gather",
      description: "Your everyday, together.",
      theme: "dark",
      color: "slate",
      gather: { accountMenu: true, notifications: true, accountSettingsUrl: "https://example.com/account" },
      layout: {
        "Your everyday": { tab: "Home", style: "row", columns: 3 },
        "Watch and unwind": { tab: "Media", style: "row", columns: 3 },
        "Connection and Wi-Fi": { tab: "Network", style: "row", columns: 3 },
      },
    },
    "services.yaml": [
      {
        "Your everyday": [
          {
            "Home Assistant": {
              href: "https://example.com/home",
              description: "Home automation",
              icon: "home-assistant.png",
              widget: { type: "homeassistant", url: "https://example.com", key: "{{GATHER_VAR_HOME_ASSISTANT_KEY}}" },
            },
          },
          {
            Mealie: {
              href: "https://example.com/mealie",
              description: "Recipes and meal planning",
              icon: "mealie.png",
            },
          },
          {
            Nextcloud: {
              href: "https://example.com/files",
              description: "Files and collaboration",
              icon: "nextcloud.png",
            },
          },
        ],
      },
      {
        "Watch and unwind": [
          { Plex: { href: "https://example.com/plex", description: "Your media library", icon: "plex.png" } },
        ],
      },
    ],
    "bookmarks.yaml": [
      {
        Everyday: [
          { GitHub: [{ href: "https://github.com", abbr: "GH" }] },
          { Wikipedia: [{ href: "https://wikipedia.org", abbr: "W" }] },
        ],
      },
    ],
    "widgets.yaml": [
      { greeting: { text: "Welcome home.", personalize: true } },
      { datetime: { text_size: "xl", format: { dateStyle: "long", timeStyle: "short" } } },
      { search: { provider: "google", target: "_blank" } },
    ],
    "gather-notifications.json": { topics: "home,services", appName: "Gather", icon: "/android-chrome-512x512.png" },
    "custom.css": "/* Add your dashboard styles here. */\n",
    "custom.js": "// Add your dashboard scripts here.\n",
  };
  const docs = Object.fromEntries(
    Object.entries(fixtures).map(([file, value]) => [
      file,
      {
        file,
        text:
          typeof value === "string"
            ? value
            : file.endsWith(".json")
              ? JSON.stringify(value, null, 2) + "\n"
              : yaml.dump(value),
        revision: "preview-0",
        backups: [],
      },
    ]),
  );
  const history = new Map();
  let sequence = 0;
  return async (body, file) => {
    const key = body?.file || file;
    const doc = docs[key];
    if (!doc) throw new Error("Unknown preview section");
    if (!body) return structuredClone(doc);
    if (body.revision !== doc.revision) throw new Error("This section changed. Reload it before saving.");
    const text = body.action === "restore" ? history.get(body.backup) : body.text;
    if (typeof text !== "string") throw new Error("Choose a valid backup.");
    if (key.endsWith(".json")) JSON.parse(text);
    else if (key.endsWith(".yaml")) yaml.load(text, { schema: yaml.JSON_SCHEMA });
    if (body.action === "validate") return { valid: true };
    const id = `preview-${++sequence}`;
    history.set(id, doc.text);
    doc.backups.unshift({ id, date: new Date().toISOString() });
    doc.text = text;
    doc.revision = id;
    return { ...structuredClone(doc), applied: true };
  };
}
