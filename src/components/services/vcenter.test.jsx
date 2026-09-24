// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import useSWR from "swr";
import { renderWithProviders } from "test-utils/render-with-providers";
import { expect, it, vi } from "vitest";
import Item from "./item";
vi.mock("swr", () => ({ default: vi.fn() }));
it("shows metrics by default and allows collapsing them even when global stats are disabled", () => {
  useSWR.mockReturnValue({ data: { powerState: "POWERED_ON", cpus: 4, memoryMiB: 8192 } });
  renderWithProviders(
    <Item groupName="Home" service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [] }} />,
    { settings: { showStats: false } },
  );
  expect(screen.getByText("Running")).toBeInTheDocument();
  expect(screen.getByText("Allocated CPUs")).toBeInTheDocument();
  const hide = screen.getByRole("button", { name: /Hide metrics/ });
  expect(hide).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(hide);
  expect(screen.queryByText("Allocated CPUs")).not.toBeInTheDocument();
  const show = screen.getByRole("button", { name: /Show metrics/ });
  expect(show).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(show);
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

it("labels live CPU and distinct memory metrics, and displays the actual sample time", () => {
  useSWR.mockReturnValue({
    data: {
      powerState: "POWERED_ON",
      cpus: 4,
      memoryMiB: 8192,
      performance: {
        status: "live",
        cpuPercent: 12.5,
        activeMemoryMiB: 2048,
        consumedMemoryMiB: 4096,
        sampledAt: "2026-09-24T18:00:00.000Z",
        intervalSeconds: 20,
      },
    },
  });
  const { container } = renderWithProviders(
    <Item service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [], showStats: true }} />,
  );
  expect(screen.getByText("12.5%")).toBeInTheDocument();
  expect(screen.getByText("2 GiB")).toBeInTheDocument();
  expect(screen.getByText("Host consumed memory")).toBeInTheDocument();
  expect(screen.getByText("8 GiB")).toBeInTheDocument();
  expect(container.querySelector("time")).toHaveAttribute("dateTime", "2026-09-24T18:00:00.000Z");
});
it.each(["permission-denied", "no-samples", "stale", "not-running"])(
  "keeps power state and allocations visible when performance is %s",
  (status) => {
    useSWR.mockReturnValue({ data: { powerState: "POWERED_ON", cpus: 4, memoryMiB: 8192, performance: { status } } });
    renderWithProviders(
      <Item service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [], showStats: true }} />,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("8 GiB")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(3);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  },
);

it("honors an explicit per-service collapsed default but allows expansion with global stats enabled", () => {
  useSWR.mockReturnValue({ data: { powerState: "POWERED_ON", cpus: 4, memoryMiB: 8192 } });
  const { container } = renderWithProviders(
    <Item service={{ name: "VM", vcenterServer: "lab", vcenterVM: "vm-1", widgets: [], showStats: false }} />,
    { settings: { showStats: true } },
  );
  expect(screen.queryByText("Allocated CPUs")).not.toBeInTheDocument();
  const button = screen.getByRole("button", { name: /Show metrics/ });
  const panel = container.querySelector(`[id="${button.getAttribute("aria-controls")}"]`);
  expect(panel).toHaveAttribute("hidden");
  fireEvent.click(button);
  expect(panel).not.toHaveAttribute("hidden");
  expect(screen.getByText("Allocated CPUs")).toBeInTheDocument();
});
