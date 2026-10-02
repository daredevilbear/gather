// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Migration from "./migration";
import { createPreviewStore } from "./preview-store";

it("validates an import, retains Gather preferences and saves only after review", async () => {
  const request = vi.fn(createPreviewStore());
  render(<Migration request={request} />);
  const file = new File(["title: Imported\n"], "settings.yaml", { type: "text/yaml" });
  file.text = async () => "title: Imported\n";
  fireEvent.change(screen.getByLabelText("Dashboard configuration file"), { target: { files: [file] } });
  const apply = await screen.findByRole("button", { name: "Import settings.yaml" });
  expect(request.mock.calls.some(([body]) => body?.action === "save")).toBe(false);
  fireEvent.click(apply);
  await screen.findByText(/settings.yaml imported/);
  const saved = await request(null, "settings.yaml");
  expect(saved.text).toContain("Imported");
  expect(saved.text).toContain("gather:");
});
it("rejects unsupported files before making a request", async () => {
  const request = vi.fn();
  render(<Migration request={request} />);
  fireEvent.change(screen.getByLabelText("Dashboard configuration file"), {
    target: { files: [new File(["token"], ".env")] },
  });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Choose settings.yaml"));
  expect(request).not.toHaveBeenCalled();
});

it.each(["docker.yaml", "kubernetes.yaml", "proxmox.yaml"])("imports %s with a reviewed revision", async (name) => {
  const request = vi.fn(createPreviewStore());
  render(<Migration request={request} canManageConnections />);
  const file = new File(["example: {}"], name);
  file.text = async () => "example: {}";
  fireEvent.change(screen.getByLabelText("Dashboard configuration file"), { target: { files: [file] } });
  fireEvent.click(await screen.findByRole("button", { name: `Import ${name}` }));
  await screen.findByText(new RegExp(`${name} imported`));
  expect((await request(null, name)).text).toBe("example: {}");
});

it("requires explicit JavaScript review before importing custom code", async () => {
  const request = vi.fn(createPreviewStore());
  render(<Migration request={request} />);
  const file = new File(["// custom"], "custom.js");
  file.text = async () => "// custom";
  fireEvent.change(screen.getByLabelText("Dashboard configuration file"), { target: { files: [file] } });
  const apply = await screen.findByRole("button", { name: "Import custom.js" });
  expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(apply);
  await screen.findByText(/custom.js imported/);
});
