import { numeric } from "../bitaxe/metrics";

export function uptime(value) {
  const seconds = numeric(value);
  if (seconds === null) return "N/A";
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  return `${Math.floor(hours / 24)}d ${hours % 24}h ${minutes % 60}m`;
}
