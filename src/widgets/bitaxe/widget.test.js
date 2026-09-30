import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";
import { activePool, difficulty, measurement, numeric } from "./metrics";
import widget from "./widget";

describe("Bitaxe telemetry", () => {
  it("handles NerdQaxe fallback status without inventing missing error or latency readings", () => {
    const mapped = widget.mappings.info.map({
      hashRate: 4783.435,
      voltage: 11765.63,
      stratum: { usingFallback: true },
      fallbackStratumURL: "backup.test",
      fallbackStratumPort: 2018,
    });
    expect(activePool(mapped)).toEqual({ mode: "fallback", address: "backup.test:2018" });
    expect(measurement(mapped.voltage, 2, " V", 1000)).toBe("11.77 V");
    expect(measurement(mapped.errorPercentage, 2, "%")).toBe("N/A");
    expect(measurement(mapped.responseTime, 1, " ms")).toBe("N/A");
  });
  it("registers a read-only system info mapping and strips unrelated device settings", () => {
    expectWidgetConfigShape(widget);
    expect(widget.mappings.info.endpoint).toBe("system/info");
    const mapped = widget.mappings.info.map(
      Buffer.from(
        JSON.stringify({
          hashRate: 1509.65,
          voltage: 4830,
          wifiPass: "secret",
          stratumPassword: "secret",
        }),
      ),
    );
    expect(mapped.hashRate).toBe(1509.65);
    expect(mapped.voltage).toBe(4830);
    expect(mapped.updatedAt).toBeGreaterThan(0);
    expect(mapped).not.toHaveProperty("wifiPass");
    expect(mapped).not.toHaveProperty("stratumPassword");
  });

  it("converts millivolts and formats current and legacy difficulty values", () => {
    expect(measurement(4830, 2, " V", 1000)).toBe("4.83 V");
    expect(measurement(11750, 2, " V", 1000)).toBe("11.75 V");
    expect(difficulty(28780000000)).toBe("28.78G");
    expect(difficulty(131180000)).toBe("131.18M");
    expect(difficulty("28.78G")).toBe("28.78G");
    expect(difficulty(0)).toBe("0.00");
  });

  it.each([undefined, null, "", " ", -1, Infinity, NaN, false, {}, "bad"])(
    "treats invalid reading %s as unavailable",
    (reading) => {
      expect(numeric(reading)).toBeNull();
      expect(measurement(reading, 1)).toBe("N/A");
      expect(difficulty(reading)).toBe("N/A");
    },
  );

  it("selects the active pool without mistaking a string zero for fallback", () => {
    const data = {
      stratumURL: "primary.test",
      stratumPort: 2018,
      fallbackStratumURL: "backup.test",
      fallbackStratumPort: 3333,
    };
    expect(activePool({ ...data, isUsingFallbackStratum: "0" })).toEqual({
      mode: "primary",
      address: "primary.test:2018",
    });
    expect(activePool({ ...data, isUsingFallbackStratum: 1 })).toEqual({
      mode: "fallback",
      address: "backup.test:3333",
    });
    expect(activePool({ isUsingFallbackStratum: true })).toEqual({ mode: "fallback", address: "N/A" });
  });
});
