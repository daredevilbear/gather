// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import useSWR from "swr";
import { renderWithProviders } from "test-utils/render-with-providers";
import { expect, it, vi } from "vitest";
import Item from "./item";
vi.mock("swr", () => ({ default: vi.fn() }));
it("shows power status and expands allocated VM resources like Proxmox", () => {
  useSWR.mockReturnValue({ data: { powerState: "POWERED_ON", cpus: 4, memoryMiB: 8192 } });
  renderWithProviders(
    <Item groupName="Home" service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [] }} />,
    { settings: { showStats: false } },
  );
  expect(screen.getByText("Running")).toBeInTheDocument();
  expect(screen.queryByText("Allocated CPUs")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /View vCenter stats/ }));
  expect(screen.getByText("Allocated CPUs")).toBeInTheDocument();
  expect(screen.getByText("8 GiB")).toBeInTheDocument();
  expect(useSWR.mock.calls[0][0]).toBe("/api/vcenter/stats?instance=lab&vm=vm-1");
  expect(useSWR.mock.calls[0][2].refreshInterval).toBe(30000);
});
it("renders the summary without needing a click", () => {
  useSWR.mockReturnValue({ data: { total: 3, running: 1, stopped: 1, suspended: 1, unknown: 0 } });
  renderWithProviders(<Item service={{ name: "Summary", vcenterServer: "lab", vcenterSummary: true, widgets: [] }} />);
  expect(screen.getByText("VMs")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});
it("treats failed HTTP responses as errors rather than showing unknown resource values", async () => {
  useSWR.mockReturnValue({ error: Error("Offline") });
  renderWithProviders(
    <Item service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [], showStats: true }} />,
  );
  expect(screen.getByText("Unavailable")).toBeInTheDocument();
  const fetcher = useSWR.mock.calls.at(-1)[1];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: false, json: async () => ({ error: "VM missing" }) })),
  );
  try {
    await expect(fetcher("/api/vcenter/stats")).rejects.toThrow("VM missing");
  } finally {
    vi.unstubAllGlobals();
  }
});
