import { expect, it } from "vitest";
import { applyMobileProfile, mobileCatalog, validMobileProfile } from "./mobile-layout";
const view = {
  settings: { gather: { tabs: ["Home"] }, layout: { A: { tab: "Home" }, B: { tab: "Home" } } },
  services: [
    {
      name: "A",
      services: [{ name: "One", href: "/one", widget: { secret: "server-only" } }, { name: "Two" }],
      groups: [{ name: "Nested", services: [] }],
    },
    { name: "B", services: [{ name: "Three" }] },
  ],
  bookmarks: [{ name: "Links", bookmarks: [{ name: "Docs" }] }],
  widgets: [],
};
const profile = {
  enabled: true,
  density: "compact",
  groups: [
    { kind: "services", name: "B", items: ["Three"] },
    { kind: "services", name: "A", items: ["Two", "One"] },
  ],
  pins: [{ kind: "services", group: "A", name: "One" }],
};
it("orders mobile groups/items, pins favorites and preserves the desktop source and newly added items", () => {
  const source = structuredClone(view);
  const result = applyMobileProfile(view, profile);
  expect(result.services.map((g) => g.name)).toEqual(["Pinned services", "B", "A"]);
  expect(result.services[2].services.map((s) => s.name)).toEqual(["Two", "One"]);
  expect(result.services[2].groups).toEqual(view.services[0].groups);
  expect(result.services[0].services[0]).toEqual(view.services[0].services[0]);
  expect(result.settings.mobileDensity).toBe("compact");
  expect(view).toEqual(source);
  expect(applyMobileProfile(view, { ...profile, enabled: false })).toBe(view);
  expect(mobileCatalog(view)[0]).toEqual({ name: "A", kind: "services", items: ["One", "Two"] });
});
it("rejects invalid profiles and permits no credential fields", () => {
  expect(validMobileProfile(profile)).toBe(true);
  for (const invalid of [
    { ...profile, password: "secret" },
    { ...profile, density: "bad" },
    { ...profile, groups: [{ kind: "services", name: "__proto__", items: [] }] },
    { ...profile, pins: [{ kind: "services", group: "A", name: "One", key: "x" }] },
  ])
    expect(validMobileProfile(invalid)).toBe(false);
});
