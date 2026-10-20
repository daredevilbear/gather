// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileEditor } from "components/account/mobile-layout";
import { componentWarnings } from "pages/about";
import { AlertRules } from "pages/notification-health";
import { afterEach, expect, it, vi } from "vitest";
const rules = {
  quietEnabled: false,
  start: "22:00",
  end: "07:00",
  timezone: "UTC",
  mutedTopics: [],
  criticalBypass: true,
  criticalPriority: 5,
  groupSeconds: 0,
};
afterEach(() => vi.restoreAllMocks());
it("saves account-scoped alert rules without changing inbox preferences", async () => {
  const request = vi.fn(async () => ({ ok: true }));
  render(
    <AlertRules data={{ account: "person", rules, topics: ["apps"] }} request={request} refresh={async () => {}} />,
  );
  fireEvent.click(screen.getByLabelText("Quiet hours"));
  fireEvent.click(screen.getByRole("button", { name: "Save alert rules" }));
  await screen.findByText("Alert rules saved.");
  expect(request).toHaveBeenCalledWith("rules", { account: "person", rules: { ...rules, quietEnabled: true } });
});
it("edits a separate phone profile, reorders groups and pins a favorite", async () => {
  const request = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
  render(
    <MobileEditor
      target="mine"
      catalog={[
        { kind: "services", name: "Everyday", items: ["Calendar"] },
        { kind: "services", name: "Network", items: [] },
      ]}
      request={request}
      refresh={async () => {}}
    />,
  );
  fireEvent.click(screen.getByLabelText("Use a separate phone layout"));
  fireEvent.change(screen.getByLabelText("Phone density"), { target: { value: "compact" } });
  fireEvent.click(screen.getByText("Everyday · services"));
  fireEvent.click(screen.getByRole("button", { name: "Pin favorite" }));
  fireEvent.click(screen.getByText("Network · services"));
  fireEvent.click(screen.getByRole("button", { name: "Move Network up" }));
  fireEvent.click(screen.getByRole("button", { name: "Save phone layout" }));
  await screen.findByText("Phone layout saved.");
  const saved = JSON.parse(request.mock.calls[0][1].body).mobileProfile;
  expect(saved.target).toBe("mine");
  expect(saved.profile.groups[0].name).toBe("Network");
  expect(saved.profile.density).toBe("compact");
  expect(saved.profile.pins).toEqual([{ kind: "services", group: "Everyday", name: "Calendar" }]);
});
it("reports mismatched component versions and a stale controller", () => {
  const warnings = componentWarnings(
    { version: "1.0.4" },
    { version: "1.0.3" },
    { version: "1.0.2", heartbeat: 1 },
    100000,
  );
  expect(warnings).toHaveLength(3);
  expect(
    componentWarnings({ version: "1.0.4" }, { version: "1.0.4" }, { version: "1.0.4", heartbeat: 100000 }, 100000),
  ).toEqual([]);
});
