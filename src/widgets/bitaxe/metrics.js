export function numeric(value) {
  if (typeof value !== "number" && (typeof value !== "string" || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function measurement(value, digits, unit = "", divisor = 1) {
  const number = numeric(value);
  return number === null ? "N/A" : `${(number / divisor).toFixed(digits)}${unit}`;
}

export function difficulty(value) {
  // Older AxeOS versions return an already formatted difficulty string.
  if (typeof value === "string" && /^\d+(\.\d+)?\s*[kMGTPE]$/i.test(value.trim())) return value.trim();
  const number = numeric(value);
  if (number === null) return "N/A";
  const exponent = Math.min(6, Math.max(0, Math.floor(Math.log10(number || 1) / 3)));
  return `${(number / 1000 ** exponent).toFixed(2)}${["", "K", "M", "G", "T", "P", "E"][exponent]}`;
}

export function activePool(data) {
  const fallback = data.isUsingFallbackStratum === true || numeric(data.isUsingFallbackStratum) === 1;
  const host = fallback ? data.fallbackStratumURL : data.stratumURL;
  const port = fallback ? data.fallbackStratumPort : data.stratumPort;
  return {
    mode: fallback ? "fallback" : "primary",
    address: typeof host === "string" && host.trim() ? `${host}${port ? `:${port}` : ""}` : "N/A",
  };
}
