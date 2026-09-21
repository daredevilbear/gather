import { expect, it } from "vitest";
import { dashboardTabs, renameDashboardTab } from "./tabs";

it("preserves legacy tabs and includes explicitly ordered empty tabs", () => {
  expect(dashboardTabs({ gather: { tabs: ["Media", "Empty"] }, layout: { A: { tab: "Home" }, B: { tab: "Media" } } }))
    .toEqual(["Media", "Empty", "Home"]);
});
it("renames every assigned group without losing layout options", () => {
  const settings = { layout: { A: { tab: "Home", columns: 3 }, B: { tab: "Media" } } };
  const renamed = renameDashboardTab(settings, "Home", "Everyday");
  expect(renamed.layout.A).toEqual({ tab: "Everyday", columns: 3 });
  expect(renamed.layout.B).toEqual(settings.layout.B);
  expect(dashboardTabs(renamed)).toEqual(["Everyday", "Media"]);
  const removed = renameDashboardTab(renamed, "Everyday", "");
  expect(removed.layout.A).toEqual({ columns: 3 });
  expect(dashboardTabs(removed)).toEqual(["Media"]);
  expect(settings.layout.A.tab).toBe("Home");
});
