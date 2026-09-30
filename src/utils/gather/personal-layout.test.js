import { expect, it } from "vitest";
import { applyPersonalLayout, initialPersonalLayout, layoutCatalog, validPersonalLayout } from "./personal-layout";
const services = [{ name: "Home", services: [{ name: "A", widget: { index: 4, type: "test" } }, { name: "B" }] }];
const bookmarks = [{ name: "Links", bookmarks: [{ name: "Docs" }] }];
const widgets = [
  { type: "search", options: { index: 3 } },
  { type: "datetime", options: { index: 0 } },
];
const settings = { layout: { Home: { tab: "Home", displayName: "Everyday" } }, gather: { tabs: ["Home"] } };
it("changes presentation without mutating shared groups or integration references", () => {
  const layout = initialPersonalLayout(layoutCatalog(settings, services, bookmarks, widgets));
  layout.tabs = ["Mine"];
  layout.groups[0].tab = "Mine";
  layout.groups[0].items = ["B", "A"];
  layout.groups[1].hidden = true;
  layout.widgets = ["datetime:0"];
  const result = applyPersonalLayout(settings, services, bookmarks, widgets, layout);
  expect(result.services[0].services.map((s) => s.name)).toEqual(["B", "A"]);
  expect(result.services[0].services[1].widget.index).toBe(4);
  expect(result.services[0].name).toBe("Home");
  expect(result.settings.layout.Home.tab).toBe("Mine");
  expect(result.bookmarks).toEqual([]);
  expect(result.widgets).toEqual([widgets[1]]);
  expect(services[0].services[0].name).toBe("A");
  expect(settings.layout.Home.tab).toBe("Home");
});
it("rejects credential fields, invalid tabs and unexpected properties", () => {
  const layout = initialPersonalLayout(layoutCatalog(settings, services, bookmarks, widgets));
  expect(validPersonalLayout(layout)).toBe(true);
  expect(validPersonalLayout({ ...layout, password: "secret" })).toBe(false);
  expect(validPersonalLayout({ ...layout, tabs: ["Home", "Home"] })).toBe(false);
  expect(validPersonalLayout({ ...layout, groups: [{ ...layout.groups[0], tab: "Missing" }] })).toBe(false);
  expect(validPersonalLayout({ ...layout, groups: [null] })).toBe(false);
});
it("restores the shared layout when no personal override is present", () => {
  expect(applyPersonalLayout(settings, services, bookmarks, widgets, null)).toEqual({
    settings,
    services,
    bookmarks,
    widgets,
  });
});
