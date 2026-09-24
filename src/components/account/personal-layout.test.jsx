// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";
import PersonalLayout from "./personal-layout";
const catalog = {
  tabs: ["Home"],
  groups: [{ name: "Services", label: "Services", kind: "services", tab: "Home", columns: 3, items: ["A", "B"] }],
  widgets: [{ key: "datetime:2", label: "Clock" }],
};
function mount(canEdit = true) {
  let saved = { canEdit, dashboard: { title: "My dashboard", links: [] }, revision: 3 };
  const request = vi.fn(async (path, body) => {
    if (path.endsWith("layout-catalog")) return catalog;
    if (body) saved = { ...saved, ...body, revision: saved.revision + 1 };
    return saved;
  });
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PersonalLayout identity="alice" status="authenticated" request={request} />
    </SWRConfig>,
  );
  return request;
}
it("saves account layout choices and can return to the shared layout", async () => {
  const request = mount();
  const tab = await screen.findByLabelText("Tab name 1");
  fireEvent.change(tab, { target: { value: "My home" } });
  fireEvent.click(screen.getByLabelText("Clock"));
  fireEvent.click(screen.getByRole("button", { name: "Save my layout" }));
  await screen.findByText(/Your layout is saved/);
  const body = request.mock.calls.find(([, body]) => body)?.[1];
  expect(body.revision).toBe(3);
  expect(body.dashboard.layout.tabs).toEqual(["My home"]);
  expect(body.dashboard.layout.groups[0].tab).toBe("My home");
  expect(body.dashboard.layout.widgets).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Use shared layout" }));
  await screen.findByText("Your dashboard now follows the shared layout.");
  expect(request.mock.calls.at(-1)[1].dashboard.layout).toBeNull();
});
it("keeps Viewer layout controls disabled", async () => {
  mount(false);
  expect(await screen.findByLabelText("Tab name 1")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save my layout" })).toBeDisabled();
});
