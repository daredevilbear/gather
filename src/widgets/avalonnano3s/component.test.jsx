// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithProviders } from "test-utils/render-with-providers";
import { expectBlockValue } from "test-utils/widget-assertions";
import Component from "./component";
const { useWidgetAPI } = vi.hoisted(() => ({ useWidgetAPI: vi.fn() }));
vi.mock("utils/proxy/use-widget-api", () => ({ default: useWidgetAPI }));

const service = { widget: { type: "avalonnano3s" } };
const data = {
  hashRate: 4124783.48,
  averageHashRate: 3054523.99,
  temperature: 80,
  maxTemperature: 83,
  fanRpm: 1040,
  fanSpeed: 21,
  accepted: 23,
  rejected: 0,
  rejectedSharePercentage: 0,
  hardwareErrors: 0,
  bestDifficulty: 5873271,
  uptime: 1520,
  updatedAt: 1790347261000,
};
describe("Nano 3s card", () => {
  it("shows converted hash rates, sensor readings and successful update time", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(<Component service={service} />);
    expectBlockValue(container, "avalonnano3s.hashrate", "4.12 TH/s");
    expectBlockValue(container, "avalonnano3s.averagehashrate", "3.05 TH/s");
    expectBlockValue(container, "avalonnano3s.fan", "1040 RPM (21%)");
    expectBlockValue(container, "avalonnano3s.accepted", "23");
    expectBlockValue(container, "avalonnano3s.hardwareerrors", "0");
    expectBlockValue(container, "avalonnano3s.uptime", "0d 0h 25m");
    expect(screen.getByText("80.0 °C")).toBeInTheDocument();
    expect(screen.getByText("0.00%")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", new Date(data.updatedAt).toISOString());
    expect(useWidgetAPI).toHaveBeenCalledWith(service.widget, "info", undefined, { refreshInterval: 10000 });
  });
  it("supports selected fields", () => {
    useWidgetAPI.mockReturnValue({ data });
    const { container } = renderWithProviders(
      <Component service={{ widget: { ...service.widget, fields: ["hashrate", "temperature"] } }} />,
    );
    expect(container.querySelectorAll(".service-block")).toHaveLength(2);
  });
  it("shows loading placeholders without an update timestamp", () => {
    useWidgetAPI.mockReturnValue({});
    const { container } = renderWithProviders(<Component service={service} />);
    expect(screen.getAllByText("-")).toHaveLength(9);
    expect(container.querySelector("time")).toBeNull();
  });
  it("shows unavailable readings as N/A and preserves a stopped fan", () => {
    useWidgetAPI.mockReturnValue({ data: { ...data, temperature: null, fanRpm: 0, hashRate: null } });
    const { container } = renderWithProviders(<Component service={service} />);
    expectBlockValue(container, "avalonnano3s.hashrate", "N/A");
    expectBlockValue(container, "avalonnano3s.fan", "0 RPM (21%)");
  });
  it("shows an error instead of stale telemetry on failure", () => {
    useWidgetAPI.mockReturnValue({ data, error: { message: "Connection refused" } });
    renderWithProviders(<Component service={service} />);
    expect(screen.queryByText("4.12 TH/s")).not.toBeInTheDocument();
    expect(screen.getAllByText(/widget.api_error/).length).toBeGreaterThan(0);
  });
});
