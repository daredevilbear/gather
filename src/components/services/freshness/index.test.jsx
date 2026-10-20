// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Freshness, { freshnessSummary, useFreshnessReporter } from "./index";
const now = 1000000;
afterEach(() => vi.useRealTimers());
it("distinguishes real zero values, stale samples, missing endpoints and refresh failures", () => {
  expect(freshnessSummary({}, now).state).toBe("waiting");
  expect(freshnessSummary({ x: { success: now, interval: 10000 } }, now).state).toBe("fresh");
  expect(freshnessSummary({ x: { success: now - 61000, interval: 10000 } }, now).state).toBe("stale");
  expect(freshnessSummary({ x: { success: now, interval: 10000 }, y: {} }, now).state).toBe("waiting");
  expect(freshnessSummary({ x: { success: now, error: true } }, now).label).toContain("cached data");
  expect(freshnessSummary({ x: { error: true } }, now).label).toContain("no data");
});
it("records another successful refresh even if the metric is unchanged, then shows offline state", () => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  let report;
  function Probe() {
    report = useFreshnessReporter();
    return <span>0 requests</span>;
  }
  render(
    <Freshness>
      <Probe />
    </Freshness>,
  );
  act(() => report("endpoint", "success", 10000));
  expect(screen.getByText(/Updated 0s ago/)).toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(45000);
    report("endpoint", "success", 10000);
  });
  expect(screen.getByText(/Updated 0s ago/)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(75000));
  expect(screen.getByText(/Stale data/)).toBeInTheDocument();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  act(() => window.dispatchEvent(new Event("offline")));
  expect(screen.getByText(/Offline/)).toBeInTheDocument();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
