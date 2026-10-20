const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const text = (value) =>
  typeof value === "string" &&
  value.trim() &&
  value.length <= 120 &&
  !["__proto__", "constructor", "prototype"].includes(value);
export const validMobileTarget = (value) => typeof value === "string" && /^(mine|shared|[a-f0-9]{48})$/.test(value);
export function validMobileProfile(value) {
  return (
    object(value) &&
    Object.keys(value).every((key) => ["enabled", "density", "groups", "pins"].includes(key)) &&
    typeof value.enabled === "boolean" &&
    ["comfortable", "compact"].includes(value.density) &&
    Array.isArray(value.groups) &&
    value.groups.length <= 200 &&
    new Set(value.groups.map((g) => `${g?.kind}:${g?.name}`)).size === value.groups.length &&
    value.groups.every(
      (g) =>
        object(g) &&
        Object.keys(g).every((key) => ["kind", "name", "items"].includes(key)) &&
        ["services", "bookmarks"].includes(g.kind) &&
        text(g.name) &&
        Array.isArray(g.items) &&
        g.items.length <= 1000 &&
        new Set(g.items).size === g.items.length &&
        g.items.every(text),
    ) &&
    Array.isArray(value.pins) &&
    value.pins.length <= 50 &&
    new Set(value.pins.map((p) => JSON.stringify(p))).size === value.pins.length &&
    value.pins.every(
      (p) =>
        object(p) &&
        Object.keys(p).sort().join(",") === "group,kind,name" &&
        ["services", "bookmarks"].includes(p.kind) &&
        text(p.group) &&
        text(p.name),
    )
  );
}
export function mobileCatalog(view) {
  return ["services", "bookmarks"].flatMap((kind) =>
    (view[kind] || []).map((group) => ({
      kind,
      name: group.name,
      items: (group[kind] || []).map((item) => item.name),
    })),
  );
}
function order(items, names) {
  return [...items].sort((a, b) => {
    const index = (name) => (names.includes(name) ? names.indexOf(name) : names.length);
    return index(a.name) - index(b.name);
  });
}
export function applyMobileProfile(view, profile) {
  if (!profile?.enabled || !validMobileProfile(profile)) return view;
  const result = {
    ...view,
    settings: { ...view.settings, mobileDensity: profile.density, layout: { ...view.settings.layout } },
  };
  for (const kind of ["services", "bookmarks"]) {
    const choices = profile.groups.filter((g) => g.kind === kind);
    result[kind] = order(
      view[kind] || [],
      choices.map((g) => g.name),
    ).map((group) => ({
      ...group,
      [kind]: order(group[kind] || [], choices.find((g) => g.name === group.name)?.items || []),
    }));
    const favorites = profile.pins
      .filter((pin) => pin.kind === kind)
      .flatMap(
        (pin) =>
          (view[kind] || []).find((g) => g.name === pin.group)?.[kind]?.filter((item) => item.name === pin.name) || [],
      );
    if (favorites.length) {
      const duplicates = favorites
        .filter((item, i) => favorites.findIndex((other) => other.name === item.name) !== i)
        .map((item) => item.name);
      const names = new Set();
      favorites.forEach((item, i) => {
        if (!duplicates.includes(item.name)) return;
        let label = `${item.name} (${i + 1})`;
        while (names.has(label)) label += " ★";
        names.add(label);
        favorites[i] = { ...item, name: label };
      });
      let name = kind === "services" ? "Pinned services" : "Pinned bookmarks";
      while ((view.services || []).some((g) => g.name === name) || (view.bookmarks || []).some((g) => g.name === name))
        name = `★ ${name}`;
      result[kind].unshift({ name, [kind]: favorites, groups: [] });
      result.settings.layout = {
        [name]: { style: "row", columns: 1, tab: view.settings.gather?.tabs?.[0] || "" },
        ...result.settings.layout,
      };
    }
  }
  // Preserve unspecified/new groups, while allowing the mobile profile to order both kinds together.
  const names = [...result.services, ...result.bookmarks].map((g) => g.name);
  const pinned = names.filter(
    (name) => ![...(view.services || []), ...(view.bookmarks || [])].some((g) => g.name === name),
  );
  const requested = [...pinned, ...profile.groups.map((g) => g.name), ...names];
  result.settings.layout = Object.fromEntries(
    [...new Set(requested)]
      .filter((name) => names.includes(name))
      .map((name) => [name, { ...result.settings.layout[name], style: "row", columns: 1 }]),
  );
  return result;
}
