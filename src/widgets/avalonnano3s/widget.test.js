import { describe, expect, it } from "vitest";

import { expectWidgetConfigShape } from "test-utils/widget-config";
import { uptime } from "./display";
import { stats, summary } from "./fixtures";
import { minerTelemetry, parseResponse } from "./metrics";
import widget from "./widget";

describe("Nano 3s telemetry", () => {
  it("parses Canaan text responses and emits only card readings", () => {
    expectWidgetConfigShape(widget);
    const data = minerTelemetry(Buffer.from(summary), stats);
    expect(data).toMatchObject({
      hashRate: 4124783.48,
      averageHashRate: 3054523.99,
      temperature: 80,
      maxTemperature: 83,
      fanRpm: 1040,
      fanSpeed: 21,
      uptime: 1520,
      accepted: 23,
      rejected: 0,
      rejectedSharePercentage: 0,
      hardwareErrors: 0,
      bestDifficulty: 5873271,
    });
    expect(data.updatedAt).toBeGreaterThan(0);
    expect(JSON.stringify(data)).not.toMatch(/private-device-id|DNA|PS|Ver/);
  });
  it("also accepts CGMiner JSON responses with a NUL terminator", () => {
    const data = minerTelemetry(JSON.stringify(parseResponse(summary)) + "\0", JSON.stringify(parseResponse(stats)));
    expect(data.temperature).toBe(80);
    expect(data.hashRate).toBe(4124783.48);
  });
  it("keeps invalid and absent values unavailable, preserving zero readings", () => {
    const row = parseResponse(summary);
    row.SUMMARY[0].Accepted = 0;
    row.SUMMARY[0].Rejected = 0;
    delete row.SUMMARY[0]["MHS 5s"];
    const data = minerTelemetry(row, stats.replace("TAvg[80]", "TAvg[-273]").replace("Fan1[1040]", "Fan1[0]"));
    expect(data.hashRate).toBeNull();
    expect(data.temperature).toBeNull();
    expect(data.fanRpm).toBe(0);
    expect(data.rejectedSharePercentage).toBeNull();
    delete row.SUMMARY[0].Accepted;
    expect(minerTelemetry(row, stats).rejectedSharePercentage).toBeNull();
  });
  it("computes rejected shares independently from hardware errors", () => {
    const data = minerTelemetry(
      summary.replace("Accepted=23,Rejected=0,Hardware Errors=0", "Accepted=90,Rejected=10,Hardware Errors=50"),
      stats,
    );
    expect(data.rejectedSharePercentage).toBe(10);
    expect(data.hardwareErrors).toBe(50);
  });
  it.each([
    "",
    "<html>Login</html>",
    "STATUS=E,Msg=Denied|SUMMARY,Accepted=1|",
    "STATUS=S|",
    '{"STATUS":[{"STATUS":"E"}],"SUMMARY":[{}]}',
  ])("rejects malformed or failed responses: %s", (raw) => {
    expect(() => minerTelemetry(raw, stats)).toThrow();
  });
  it("rejects missing module statistics", () => {
    expect(() => minerTelemetry(summary, "STATUS=S|STATS=0,ID=AVALON0|")).toThrow();
  });
  it("formats uptime without treating missing uptime as zero", () => {
    expect(uptime(90061)).toBe("1d 1h 1m");
    expect(uptime(0)).toBe("0d 0h 0m");
    expect(uptime(null)).toBe("N/A");
  });
});
