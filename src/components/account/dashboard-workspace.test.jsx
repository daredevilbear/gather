// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { createPreviewStore } from "components/settings/preview-store";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";
import DashboardWorkspace from "./dashboard-workspace";
it("reuses the settings editor, saves personal edits and manages sharing/current selection", async () => {
  const documents = createPreviewStore();
  let state = { current: "shared", share: null, canEdit: true };
  const request = vi.fn(async (body, file) => {
    if (file === "shared-services") return { services: [] };
    if (file || body?.file) return documents(body, file);
    if (body?.action === "current") state.current = body.target;
    if (body?.action === "sharing") state.share = body.enabled ? "a".repeat(48) : null;
    return { ...state };
  });
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <DashboardWorkspace identity="alice" status="authenticated" request={request} preview />
    </SWRConfig>,
  );
  await screen.findByRole("heading", { name: "My dashboard settings" });
  const navigation = screen.getByRole("navigation", { name: "Settings sections" });
  expect(within(navigation).getByRole("button", { name: "Services" })).toBeInTheDocument();
  expect(within(navigation).queryByRole("button", { name: "Users & access" })).not.toBeInTheDocument();
  expect(within(navigation).queryByRole("button", { name: "Custom JavaScript" })).not.toBeInTheDocument();
  fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "Alice home" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
  await screen.findByText("Saved to your dashboard.");
  expect((await documents(null, "settings.yaml")).text).toContain("Alice home");
  fireEvent.click(screen.getByText("Choose current dashboard & sharing"));
  fireEvent.click(screen.getByRole("button", { name: "Use my dashboard" }));
  await screen.findByText(/Current dashboard saved/);
  expect(state.current).toBe("mine");
  fireEvent.click(screen.getByRole("button", { name: "Share my dashboard" }));
  expect((await screen.findByLabelText("Share link")).value).toContain("?dashboard=");
  fireEvent.click(screen.getByRole("button", { name: "Stop sharing" }));
  await screen.findByText(/Sharing disabled/);
  expect(screen.queryByLabelText("Share link")).not.toBeInTheDocument();
});
