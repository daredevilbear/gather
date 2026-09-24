// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import * as yaml from "js-yaml";
import { expect, it, vi } from "vitest";
import { createPreviewStore } from "./preview-store";
import Vcenter from "./vcenter";
it("adds selected VM and summary to the chosen group only after review, and skips duplicates", async () => {
  const request = createPreviewStore();
  render(<Vcenter preview request={request} />);
  fireEvent.click(screen.getByRole("button", { name: "Check & load inventory" }));
  fireEvent.click(await screen.findByLabelText(/Example VM/));
  fireEvent.change(screen.getByLabelText("Destination tab / group"), { target: { value: "Watch and unwind" } });
  fireEvent.click(screen.getByRole("button", { name: "Review dashboard cards" }));
  await screen.findByRole("button", { name: "Add to dashboard" });
  expect((await request(null, "services.yaml")).revision).toBe("preview-0");
  fireEvent.click(screen.getByRole("button", { name: "Add to dashboard" }));
  await screen.findByText(/2 cards added/);
  const entries = yaml.load((await request(null, "services.yaml")).text)[1]["Watch and unwind"];
  expect(entries).toHaveLength(3);
  expect(entries[1]["Example VM"].vcenterVM).toBe("vm-1");
  expect(entries[2]["Example vCenter overview"].vcenterSummary).toBe(true);
  fireEvent.click(screen.getByLabelText(/Example VM/));
  fireEvent.click(screen.getByRole("button", { name: "Review dashboard cards" }));
  await screen.findByText(/already on the dashboard/);
});
it("requires saved connections and reports stale revisions without overwriting", async () => {
  const store = createPreviewStore();
  const request = vi.fn((body, file) =>
    body?.action === "save" ? Promise.reject(Error("Section changed; review again.")) : store(body, file),
  );
  const { rerender } = render(<Vcenter preview request={request} connectionsDirty />);
  expect(screen.getByRole("button", { name: "Check & load inventory" })).toBeDisabled();
  rerender(<Vcenter preview request={request} />);
  fireEvent.click(screen.getByRole("button", { name: "Check & load inventory" }));
  await screen.findByLabelText(/Example VM/);
  fireEvent.click(screen.getByRole("button", { name: "Review dashboard cards" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add to dashboard" }));
  await screen.findByRole("alert");
  expect((await store(null, "services.yaml")).revision).toBe("preview-0");
});
