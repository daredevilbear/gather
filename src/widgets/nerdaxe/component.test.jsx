// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";
import { expectBlockValue } from "test-utils/widget-assertions";

const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));
vi.mock("utils/proxy/use-widget-api", () => ({ default: useWidgetAPI }));

import Component from "./component";

const service = { widget: { type: "nerdaxe" } };
const data = {
  hashRate: 1509.65,
  temp: 49.9,
  vrTemp: 78,
  voltage: 4830,
  bestDiff: 28780000000,
  bestSessionDiff: "131.18M",
  rejectedSharePercentage: 0,
  pingRtt: 15,
  fanrpm: 3163,
  fanspeed: 99,
  stratumURL: "ddbear.io",
  stratumPort: 2018,
  isUsingFallbackStratum: 0,
  updatedAt: 1790347261000,
};

describe("NerdAxe card", () => {
  it("shows all screenshot metrics and successful fetch time", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(<Component service={service} />);
    expectBlockValue(container, "nerdaxe.hashrate", "1509.65 GH/s");
    expectBlockValue(container, "nerdaxe.voltage", "4.83 V");
    expectBlockValue(container, "nerdaxe.bestdifficulty", "28.78G");
    expectBlockValue(container, "nerdaxe.sessionbest", "131.18M");
    expectBlockValue(container, "nerdaxe.rejectedshares", "0.00%");
    expectBlockValue(container, "nerdaxe.poolping", "15.0 ms");
    expectBlockValue(container, "nerdaxe.fan", "3163 RPM (99%)");
    expect(screen.getByText("49.9 °C")).toBeInTheDocument();
    expect(screen.getByText("VR: 78.0 °C")).toBeInTheDocument();
    expect(screen.getByText("ddbear.io:2018")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(data.updatedAt).toISOString());
    expect(useWidgetAPI).toHaveBeenLastCalledWith(service.widget, "info", undefined, { refreshInterval: 10000 });
  });

  it("preserves a stopped fan and zero error rate while unavailable latency is N/A", () => {
    useWidgetAPI.mockReturnValue({ data: { ...data, fanrpm: 0, fanspeed: 100, pingRtt: 0, vrTemp: -1 } });
    const { container } = renderWithProviders(<Component service={service} />);
    expectBlockValue(container, "nerdaxe.fan", "0 RPM (100%)");
    expectBlockValue(container, "nerdaxe.rejectedshares", "0.00%");
    expectBlockValue(container, "nerdaxe.poolping", "N/A");
    expect(screen.getByText("VR: N/A")).toBeInTheDocument();
  });

  it("supports configured fields", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(
      <Component service={{ widget: { type: "nerdaxe", fields: ["hashrate", "temperature"] } }} />,
    );
    expect(container.querySelectorAll(".service-block")).toHaveLength(2);
    expect(screen.queryByText("nerdaxe.voltage")).not.toBeInTheDocument();
  });

  it("shows loading placeholders without a fabricated update time", () => {
    useWidgetAPI.mockReturnValue({});
    const { container } = renderWithProviders(<Component service={service} />);
    expect(screen.getAllByText("-")).toHaveLength(9);
    expect(container.querySelector("time")).toBeNull();
  });

  it("does not show stale successful data when the device is unreachable", () => {
    useWidgetAPI.mockReturnValue({ data, error: { message: "Connection refused" } });
    renderWithProviders(<Component service={service} />);
    expect(screen.getAllByText(/widget.api_error/).length).toBeGreaterThan(0);
    expect(screen.queryByText("1509.65 GH/s")).not.toBeInTheDocument();
  });
});
