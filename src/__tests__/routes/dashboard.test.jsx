// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { PersonalDashboardContent } from "pages/dashboard";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";

const initial = {
  canEdit: true,
  revision: 1,
  dashboard: {
    title: "Mine",
    links: [{ name: "Home", url: "https://example.test", description: "My home", tab: "Home" }],
  },
};
it("saves only the personal draft and current revision", async () => {
  const request = vi.fn(async (body) => (body ? { ...initial, ...body, revision: 2 } : structuredClone(initial)));
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PersonalDashboardContent identity="alice" status="authenticated" request={request} />
    </SWRConfig>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Edit my dashboard" }));
  fireEvent.change(screen.getByLabelText("Dashboard title"), { target: { value: "Private workspace" } });
  fireEvent.click(screen.getByRole("button", { name: "Save dashboard" }));
  await screen.findByText("Dashboard saved.");
  expect(request).toHaveBeenCalledWith({
    dashboard: { ...initial.dashboard, title: "Private workspace" },
    revision: 1,
  });
});
it("does not offer editing to a viewer", async () => {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PersonalDashboardContent
        identity="bob"
        status="authenticated"
        request={async () => ({ ...initial, canEdit: false })}
      />
    </SWRConfig>,
  );
  await screen.findByRole("link", { name: "Home" });
  expect(screen.queryByRole("button", { name: "Edit my dashboard" })).not.toBeInTheDocument();
});
