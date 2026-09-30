export function performanceMessage(status) {
  return (
    {
      live: "Live utilization available.",
      stale: "Older sample — waiting for fresh performance data.",
      "no-samples": "No performance sample available yet. Newly started VMs may take a moment.",
      "not-running": "Live utilization is available while the VM is running.",
      "permission-denied": "Performance access denied. Check the vCenter service account’s read permissions.",
      unsupported: "Real-time counters are not available for this VM or vCenter API.",
      "invalid-response": "vCenter returned an unexpected performance response.",
      unavailable: "Live utilization is temporarily unavailable. Check the vCenter connection and /sdk access.",
    }[status] || "Live utilization is temporarily unavailable."
  );
}
