import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";
import { activePool } from "../bitaxe/metrics";
import widget from "./widget";

const map = widget.mappings.info.map;

describe("NerdAxe telemetry", () => {
  it("maps the live schema without leaking device or pool credentials", () => {
    expectWidgetConfigShape(widget);
    expect(widget.mappings.info.endpoint).toBe("system/info");
    const data = map(
      Buffer.from(
        JSON.stringify({
          hashRate: 5789.091,
          voltage: 11750,
          sharesAccepted: 90,
          sharesRejected: 0,
          lastpingrtt: 53,
          stratum: { usingFallback: true, pools: [{ connected: true, pingRtt: 52.42857143, password: "secret" }] },
          fallbackStratumURL: "backup.test",
          fallbackStratumPort: 2018,
          wifiPass: "secret",
          stratumUser: "private",
        }),
      ),
    );
    expect(data).toMatchObject({
      hashRate: 5789.091,
      voltage: 11750,
      pingRtt: 52.42857143,
      rejectedSharePercentage: 0,
    });
    expect(data.updatedAt).toBeGreaterThan(0);
    expect(activePool(data)).toEqual({ mode: "fallback", address: "backup.test:2018" });
    expect(data).not.toHaveProperty("stratum");
    expect(data).not.toHaveProperty("wifiPass");
    expect(data).not.toHaveProperty("stratumUser");
  });

  it("calculates rejected shares independently of hardware errors", () => {
    expect(map({ sharesAccepted: 98, sharesRejected: 2, errorPercentage: 7 }).rejectedSharePercentage).toBe(2);
  });

  it.each([
    {},
    { sharesAccepted: 0, sharesRejected: 0 },
    { sharesAccepted: 1 },
    { sharesAccepted: -1, sharesRejected: 2 },
    { sharesAccepted: 2, sharesRejected: "bad" },
  ])("does not fabricate a rejection rate: %j", (data) => {
    expect(map(data).rejectedSharePercentage).toBeNull();
  });

  it("uses the connected pool, supports legacy ping, and excludes disconnected readings", () => {
    expect(
      map({
        stratum: {
          pools: [
            { connected: false, pingRtt: 900 },
            { connected: true, pingRtt: 12 },
          ],
        },
      }).pingRtt,
    ).toBe(12);
    expect(map({ lastpingrtt: 42 }).pingRtt).toBe(42);
    expect(map({ lastpingrtt: 42, stratum: { pools: [{ connected: true, pingRtt: -1 }] } }).pingRtt).toBe(42);
    expect(map({ lastpingrtt: 42, stratum: { pools: [{ connected: false, pingRtt: 12 }] } }).pingRtt).toBeNull();
    expect(
      map({
        lastpingrtt: 42,
        stratum: {
          pools: [
            { connected: true, pingRtt: 12 },
            { connected: true, pingRtt: 15 },
          ],
        },
      }).pingRtt,
    ).toBe(42);
    expect(map({}).pingRtt).toBeNull();
  });
});
