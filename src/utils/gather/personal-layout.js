// Personal layouts contain presentation choices only, never connection credentials.
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const text = (v, max = 120) =>
  typeof v === "string" && v.length <= max && !["__proto__", "constructor", "prototype"].includes(v);
const keys = (v, allowed) => object(v) && Object.keys(v).every((key) => allowed.includes(key));
const unique = (items) => new Set(items).size === items.length;
export function validPersonalLayout(value) {
  return (
    keys(value, ["tabs", "groups", "widgets"]) &&
    Array.isArray(value.tabs) &&
    value.tabs.length <= 100 &&
    unique(value.tabs.map((tab) => (typeof tab === "string" ? tab.toLowerCase() : tab))) &&
    value.tabs.every((t) => text(t, 80) && t.trim()) &&
    Array.isArray(value.groups) &&
    value.groups.length <= 200 &&
    unique(value.groups.map((g) => `${g?.kind}:${g?.name}`)) &&
    value.groups.every(
      (g) =>
        keys(g, ["name", "kind", "tab", "columns", "hidden", "items"]) &&
        text(g.name) &&
        g.name.trim() &&
        ["services", "bookmarks"].includes(g.kind) &&
        text(g.tab, 80) &&
        (!g.tab || value.tabs.includes(g.tab)) &&
        Number.isInteger(g.columns) &&
        g.columns >= 1 &&
        g.columns <= 12 &&
        typeof g.hidden === "boolean" &&
        Array.isArray(g.items) &&
        g.items.length <= 1000 &&
        unique(g.items) &&
        g.items.every((i) => text(i) && i.trim()),
    ) &&
    Array.isArray(value.widgets) &&
    value.widgets.length <= 100 &&
    unique(value.widgets) &&
    value.widgets.every((w) => text(w, 150))
  );
}
export const widgetKey = (widget) => `${widget.type}:${widget.options?.index ?? 0}`;
export function layoutCatalog(settings, services, bookmarks, widgets) {
  const groups = [
    ...services.map((g) => ({ ...g, kind: "services" })),
    ...bookmarks.map((g) => ({ ...g, kind: "bookmarks" })),
  ];
  return {
    tabs: [
      ...new Set(
        [...(settings.gather?.tabs || []), ...Object.values(settings.layout || {}).map((g) => g?.tab)].filter(Boolean),
      ),
    ],
    groups: groups.map((g) => ({
      name: g.name,
      label: settings.layout?.[g.name]?.displayName || g.name,
      kind: g.kind,
      tab: settings.layout?.[g.name]?.tab || "",
      columns: settings.layout?.[g.name]?.columns || 3,
      items: [...(g[g.kind] || []), ...(g.groups || [])].map((item) => item.name),
    })),
    widgets: widgets.map((w) => ({ key: widgetKey(w), label: w.type })),
  };
}
export function initialPersonalLayout(catalog) {
  return {
    tabs: catalog.tabs,
    groups: catalog.groups.map(({ label, ...g }) => ({ ...g, hidden: false })),
    widgets: catalog.widgets.map((w) => w.key),
  };
}
export function applyPersonalLayout(settings, services, bookmarks, widgets, layout) {
  if (!layout || !validPersonalLayout(layout)) return { settings, services, bookmarks, widgets };
  const filterGroups = (kind, groups) =>
    layout.groups
      .filter((g) => g.kind === kind && !g.hidden)
      .flatMap((choice) => {
        const group = groups.find((g) => g.name === choice.name);
        if (!group) return [];
        const order = (items = []) => choice.items.flatMap((name) => items.filter((item) => item.name === name));
        return [{ ...group, [kind]: order(group[kind]), ...(group.groups ? { groups: order(group.groups) } : {}) }];
      });
  const personalSettings = {
    ...settings,
    layout: Object.fromEntries(
      layout.groups
        .filter((g) => !g.hidden)
        .map((g) => [g.name, { ...settings.layout?.[g.name], tab: g.tab, columns: g.columns, style: "row" }]),
    ),
    gather: { ...settings.gather, tabs: layout.tabs },
  };
  return {
    settings: personalSettings,
    services: filterGroups("services", services),
    bookmarks: filterGroups("bookmarks", bookmarks),
    widgets: layout.widgets.flatMap((key) => widgets.filter((w) => widgetKey(w) === key)),
  };
}
