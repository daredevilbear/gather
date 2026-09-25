export function duration(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "N/A";
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds)}s`;
}

export function size(bytes, unit) {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "N/A";
  return `${(bytes / (unit === "GB" ? 1e9 : 1e6)).toFixed(2)} ${unit}`;
}

export function syncPercent(data) {
  if (!Number.isFinite(data?.progress)) return "N/A";
  return data.synced ? "100%" : `${Math.min(99.99, data.progress * 100).toFixed(2)}%`;
}
