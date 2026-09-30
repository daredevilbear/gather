// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { renderWithProviders } from "test-utils/render-with-providers";
import { expectBlockValue } from "test-utils/widget-assertions";
import { describe, expect, it, vi } from "vitest";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));
vi.mock("utils/proxy/use-widget-api", () => ({ default: useWidgetAPI }));

import Component from "./component";
import { duration, size, syncPercent } from "./metrics";

const service = { widget: { type: "bitcoinnode" } };
const data = {
  connections: 23,
  peers: { clearnet: 5, tor: 11, i2p: 7, other: 0 },
  mempool: 241e6,
  blockchainSize: 879e9,
  uptime: 172800,
  synced: true,
  progress: 1,
  networkActive: true,
  version: "Satoshi:31.1.0",
  height: 968563,
  chain: "main",
  blocks: [{ hash: "abc", height: 968563, size: 1650000, time: 1790347261 }],
  updatedAt: 1790347302000,
};

describe("Bitcoin Node card", () => {
  it("shows screenshot metrics, networks and block details", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(<Component service={service} />);
    expectBlockValue(container, "bitcoinnode.connections", "23");
    expectBlockValue(container, "bitcoinnode.mempool", "241.00 MB");
    expectBlockValue(container, "bitcoinnode.blockchainsize", "879.00 GB");
    expectBlockValue(container, "bitcoinnode.uptime", "2d 0h");
    expectBlockValue(container, "bitcoinnode.sync", "bitcoinnode.synchronized 100%");
    expect(screen.getByText("bitcoinnode.tor")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("1.65 MB")).toBeInTheDocument();
    expect(screen.getByText("41s bitcoinnode.ago")).toBeInTheDocument();
  });
  it("supports the compact four-metric layout", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(
      <Component
        service={{ widget: { type: "bitcoinnode", fields: ["connections", "mempool", "blockchainsize", "uptime"] } }}
      />,
    );
    expect(container.querySelectorAll(".service-block")).toHaveLength(4);
    expect(screen.queryByText("bitcoinnode.latestblocks")).not.toBeInTheDocument();
    expect(screen.queryByText("bitcoinnode.tor")).not.toBeInTheDocument();
  });
  it("distinguishes syncing, networking disabled, and unavailable recent blocks", () => {
    useWidgetAPI.mockReturnValue({
      data: { ...data, synced: false, progress: 0.999999, networkActive: false, blocks: [], blocksUnavailable: true },
    });
    renderWithProviders(<Component service={service} />);
    expect(screen.getByText("bitcoinnode.syncing 99.99%")).toBeInTheDocument();
    expect(screen.getByText("bitcoinnode.networkdisabled")).toBeInTheDocument();
    expect(screen.getByText("bitcoinnode.blocksunavailable")).toBeInTheDocument();
  });
  it("renders loading placeholders then errors without stale healthy data", () => {
    useWidgetAPI.mockReturnValue({});
    const { unmount } = renderWithProviders(<Component service={service} />);
    expect(screen.getAllByText("-")).toHaveLength(8);
    useWidgetAPI.mockReturnValue({ data, error: { message: "RPC denied" } });
    unmount();
    renderWithProviders(<Component service={service} />);
    expect(screen.getAllByText(/widget.api_error/).length).toBeGreaterThan(0);
    expect(screen.queryByText("879.00 GB")).not.toBeInTheDocument();
  });
  it("formats zeros and rejects absent readings", () => {
    expect(duration(0)).toBe("0s");
    expect(size(0, "MB")).toBe("0.00 MB");
    expect(size(null, "GB")).toBe("N/A");
    expect(duration(undefined)).toBe("N/A");
    expect(syncPercent({ progress: 1, synced: false })).toBe("99.99%");
  });
});
