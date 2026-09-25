import * as yaml from "js-yaml";

import { validate } from "./config-store";
import { DASHBOARD_FILES } from "./dashboard-workspace";

const presentation = [
  "title",
  "description",
  "favicon",
  "theme",
  "color",
  "background",
  "layout",
  "headerStyle",
  "language",
  "target",
  "hideVersion",
  "statusStyle",
  "showStats",
  "useEqualHeights",
  "fullWidth",
  "maxGroupColumns",
  "disableCollapse",
  "hideErrors",
  "iconStyle",
  "fiveColumns",
];
const pick = (value, fields) =>
  Object.fromEntries(fields.filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
export function seedDocuments(settings, services, bookmarks, widgets) {
  const serviceGroups = (groups) =>
    groups.map((group) => ({
      [group.name]: [
        ...(group.services || []).map((service) => ({
          [service.name]: {
            ...pick(service, ["href", "description", "icon", "target"]),
            gatherSharedService: { group: group.name, name: service.name },
          },
        })),
        ...serviceGroups(group.groups || []),
      ],
    }));
  return Object.fromEntries(
    Object.entries({
      "settings.yaml": {
        ...pick(settings, presentation),
        title: "My dashboard",
        gather: { tabs: settings.gather?.tabs || [] },
      },
      "services.yaml": serviceGroups(services),
      "bookmarks.yaml": bookmarks.map((group) => ({
        [group.name]: group.bookmarks.map((bookmark) => ({
          [bookmark.name]: [pick(bookmark, ["href", "description", "icon", "abbr", "target"])],
        })),
      })),
      "widgets.yaml": widgets.map((widget) => ({
        [widget.type]: {
          ...pick(widget.options || {}, [
            "format",
            "text",
            "text_size",
            "provider",
            "target",
            "showSearchSuggestions",
            "searchFocus",
            "locale",
            "date",
            "time",
            "icon",
          ]),
          gatherSharedWidget: widget.options?.index ?? 0,
        },
      })),
    }).map(([file, value]) => [file, yaml.dump(value, { noRefs: true })]),
  );
}
export function validateDashboardDocument(file, text) {
  if (!DASHBOARD_FILES.includes(file)) throw Error("This section is managed in server Dashboard Settings.");
  const value = validate(file, text);
  function check(node) {
    if (typeof node === "string" && /\{\{|^\s*(javascript|data|vbscript):/i.test(node))
      throw Error("Use plain values and safe URLs in personal dashboards.");
    if (typeof node === "string" && /^https?:/i.test(node)) {
      const url = new URL(node);
      if (url.username || url.password) throw Error("URLs must not contain credentials.");
    }
    if (!node || typeof node !== "object") return;
    for (const [key, child] of Object.entries(node)) {
      if (
        /^(password|username|key|apiKey|token|secret|widget|widgets|server|container|proxmoxNode|proxmoxVMID|vcenterServer|vcenterVM|vcenterHost|vcenterSummary)$/i.test(
          key,
        )
      )
        throw Error("Use a shared service reference for integrations. Connection credentials stay in server settings.");
      check(child);
    }
  }
  if (["services.yaml", "bookmarks.yaml"].includes(file)) {
    const visit = (groups) =>
      groups.forEach((group) =>
        Object.values(group)[0].forEach((entry) => {
          const detail = Object.values(entry)[0];
          if (file === "services.yaml" && Array.isArray(detail)) visit([entry]);
          else if (file === "bookmarks.yaml") detail.forEach(check);
          else check(detail);
        }),
      );
    visit(value);
  } else check(value);
  if (file === "settings.yaml") {
    if (Object.keys(value).some((key) => ![...presentation, "gather"].includes(key)))
      throw Error("This setting is managed by the server administrator.");
    if (Object.keys(value.gather || {}).some((key) => !["tabs", "homeWidgetsPosition"].includes(key)))
      throw Error("Account and notification access is managed separately.");
  }
  return value;
}
export function renderDocuments(documents, shared, inheritedSettings) {
  const values = Object.fromEntries(
    DASHBOARD_FILES.map((file) => [file, validateDashboardDocument(file, documents[file])]),
  );
  const find = (groups, ref) => {
    for (const group of groups) {
      const match = group.name === ref?.group && group.services?.find((service) => service.name === ref.name);
      if (match) return match;
      const nested = find(group.groups || [], ref);
      if (nested) return nested;
    }
    return null;
  };
  const groups = (raw) =>
    raw.map((entry) => {
      const [name, entries] = Object.entries(entry)[0];
      return {
        name,
        services: entries.flatMap((item) => {
          const [label, detail] = Object.entries(item)[0];
          if (Array.isArray(detail)) return [];
          const { gatherSharedService, ...personal } = detail;
          const source = find(shared.services, gatherSharedService);
          return [{ ...(source || {}), ...personal, name: label, type: "service", widgets: source?.widgets || [] }];
        }),
        groups: groups(entries.filter((item) => Array.isArray(Object.values(item)[0]))),
      };
    });
  const settings = {
    ...inheritedSettings,
    ...values["settings.yaml"],
    gather: { ...inheritedSettings.gather, ...values["settings.yaml"].gather },
  };
  const ordered = (items) => {
    const names = Object.keys(settings.layout || {});
    return [...items].sort(
      (a, b) =>
        (names.indexOf(a.name) < 0 ? names.length : names.indexOf(a.name)) -
        (names.indexOf(b.name) < 0 ? names.length : names.indexOf(b.name)),
    );
  };
  return {
    settings,
    services: ordered(groups(values["services.yaml"])),
    bookmarks: ordered(
      values["bookmarks.yaml"].map((group) => {
        const [name, entries] = Object.entries(group)[0];
        return {
          name,
          bookmarks: entries.map((entry) => {
            const [label, detail] = Object.entries(entry)[0];
            return { name: label, ...detail[0] };
          }),
        };
      }),
    ),
    widgets: values["widgets.yaml"].map((entry, index) => {
      const [type, options] = Object.entries(entry)[0];
      const { gatherSharedWidget, ...personal } = options;
      const source = shared.widgets.find(
        (widget) => widget.type === type && widget.options?.index === gatherSharedWidget,
      );
      return { type, options: { ...(source?.options || { index }), ...personal } };
    }),
  };
}
