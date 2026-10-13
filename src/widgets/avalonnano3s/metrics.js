import { numeric } from "../bitaxe/metrics";

export function parseResponse(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
  let response;
  if (typeof text === "string") {
    const cleaned = text.replace(/\0+$/, "").trim();
    if (cleaned.startsWith("{")) response = JSON.parse(cleaned);
    else {
      response = {};
      for (const record of cleaned.split("|")) {
        if (!record.trim()) continue;
        const parts = record.split(/,(?=[^,=\[\]|]+=)/);
        const marker = parts[0].split("=")[0];
        const row = {};
        for (const part of parts) {
          const equals = part.indexOf("=");
          if (equals !== -1) row[part.slice(0, equals).trim()] = part.slice(equals + 1).trim();
        }
        (response[marker] ??= []).push(row);
      }
    }
  } else response = raw;
  if (!response || typeof response !== "object" || Array.isArray(response)) throw new Error("Invalid miner data");
  if (
    !Array.isArray(response.STATUS) ||
    !response.STATUS.length ||
    response.STATUS.some((row) => !["S", "I"].includes(row.STATUS))
  ) {
    throw new Error("Miner API error");
  }
  return response;
}

function stat(moduleStats, key) {
  const match = moduleStats.match(new RegExp(`(?:^|\\s)${key}\\[([^\\]]*)\\]`));
  return numeric(match?.[1].replace(/%$/, ""));
}

export function minerTelemetry(summaryRaw, statsRaw) {
  const summary = parseResponse(summaryRaw).SUMMARY?.[0];
  const stats = parseResponse(statsRaw).STATS;
  if (!summary || !Array.isArray(stats) || !stats.length) throw new Error("Missing miner telemetry");
  const moduleStats = stats.map((row) => row["MM ID0"]).find((value) => typeof value === "string");
  if (!moduleStats) throw new Error("Missing Nano 3s module telemetry");
  const accepted = numeric(summary.Accepted);
  const rejected = numeric(summary.Rejected);
  const total = accepted === null || rejected === null ? null : accepted + rejected;
  return {
    hashRate: numeric(summary["MHS 5s"]),
    averageHashRate: numeric(summary["MHS av"]),
    temperature: stat(moduleStats, "TAvg"),
    maxTemperature: stat(moduleStats, "TMax"),
    fanRpm: stat(moduleStats, "Fan1"),
    fanSpeed: stat(moduleStats, "FanR"),
    uptime: numeric(summary.Elapsed),
    accepted,
    rejected,
    rejectedSharePercentage: total > 0 ? (rejected / total) * 100 : null,
    hardwareErrors: numeric(summary["Hardware Errors"]),
    bestDifficulty: numeric(summary["Best Share"]),
    updatedAt: Date.now(),
  };
}
