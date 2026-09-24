import { useEffect, useState } from "react";
import useSWR from "swr";

import { performanceMessage } from "utils/gather/vcenter-performance-status";

const states = { POWERED_ON: "Running", POWERED_OFF: "Stopped", SUSPENDED: "Suspended" };
export function useVcenter(service) {
  const query = new URLSearchParams({ instance: service.vcenterServer });
  if (service.vcenterHost) query.set("host", service.vcenterHost);
  else if (service.vcenterVM) query.set("vm", service.vcenterVM);
  return useSWR(
    `/api/vcenter/stats?${query}`,
    async (url) => {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.error) throw Error(result.error || "vCenter unavailable");
      return result;
    },
    { refreshInterval: 30000 },
  );
}
export function VcenterStatus({ service, style }) {
  const { data, error } = useVcenter(service);
  const label = error
    ? "Unavailable"
    : data
      ? service.vcenterHost
        ? { connected: "Connected", disconnected: "Disconnected", notResponding: "Not responding" }[
            data.connectionState
          ] || "Unknown"
        : states[data.powerState] || "Unknown"
      : "Loading";
  const color = error
    ? "text-rose-500"
    : (service.vcenterHost ? data?.connectionState === "connected" : data?.powerState === "POWERED_ON")
      ? "text-emerald-500"
      : "text-orange-400";
  return (
    <span title={label} className={`px-1.5 py-0.5 text-[10px] uppercase ${color}`}>
      {style === "dot" ? (
        <>
          <span aria-hidden="true">●</span>
          <span className="sr-only">{label}</span>
        </>
      ) : (
        label
      )}
    </span>
  );
}
function UpdatedAge({ timestamp }) {
  const [now, setNow] = useState(null);
  const updated = timestamp ? Date.parse(timestamp) : NaN;
  useEffect(() => {
    if (!Number.isFinite(updated)) return undefined;
    const initial = setTimeout(() => setNow(Date.now()), 0);
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [updated]);
  if (!Number.isFinite(updated)) return "—";
  const seconds = Math.max(0, Math.floor((now - updated) / 1000));
  const [amount, unit] =
    seconds < 60
      ? [seconds, "second"]
      : seconds < 3600
        ? [Math.floor(seconds / 60), "minute"]
        : seconds < 86400
          ? [Math.floor(seconds / 3600), "hour"]
          : [Math.floor(seconds / 86400), "day"];
  return (
    <time dateTime={new Date(updated).toISOString()} title={new Date(updated).toISOString()}>
      {now === null ? "—" : `${amount} ${unit}${amount === 1 ? "" : "s"} ago`}
    </time>
  );
}
export function VcenterDetails({ service }) {
  const { data, error } = useVcenter(service);
  if (error)
    return (
      <p role="status" className="p-2 text-xs">
        vCenter unavailable. Retry shortly or check the connection.
      </p>
    );
  if (!data)
    return (
      <p role="status" className="p-2 text-xs">
        Loading vCenter…
      </p>
    );
  const performance = data.performance || { status: "unavailable" };
  const number = (value, suffix) =>
    typeof value === "number" && Number.isFinite(value)
      ? `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`
      : "—";
  const health = { green: "Healthy", yellow: "Warning", red: "Critical", gray: "Unknown" };
  const fields = service.vcenterHost
    ? [
        ["vCenter health", health[data.health] || "Unknown"],
        ["Maintenance", data.maintenance === true ? "Active" : data.maintenance === false ? "Off" : "Unknown"],
        ["CPU usage", number(data.cpuPercent, "%")],
        [
          "Memory used / total",
          `${number(data.usedMemoryMiB == null ? null : data.usedMemoryMiB / 1024, "")} / ${number(data.totalMemoryMiB == null ? null : data.totalMemoryMiB / 1024, " GiB")}`,
        ],
        ["Running / total VMs", `${number(data.runningVMs, "")} / ${number(data.totalVMs, "")}`],
      ]
    : service.vcenterVM
      ? [
          ["CPU usage", number(performance.cpuPercent, "%")],
          [
            "Active memory",
            number(performance.activeMemoryMiB == null ? null : performance.activeMemoryMiB / 1024, " GiB"),
          ],
          [
            "Host consumed memory",
            number(performance.consumedMemoryMiB == null ? null : performance.consumedMemoryMiB / 1024, " GiB"),
          ],
          ["Allocated CPUs", data.cpus],
          ["Allocated memory", `${data.memoryMiB / 1024} GiB`],
        ]
      : [
          ["VMs", data.total],
          ["Running", data.running],
          ["Stopped", data.stopped],
          ["Suspended", data.suspended],
          ...(data.unknown ? [["Unknown", data.unknown]] : []),
        ];
  if (service.vcenterHost || service.vcenterVM)
    fields.push([
      "Updated",
      <UpdatedAge key="updated" timestamp={service.vcenterHost ? data.checkedAt : performance.sampledAt} />,
    ]);
  return (
    <div>
      <dl
        className="flex flex-wrap gap-1 p-1 text-center"
        aria-label={
          service.vcenterHost ? "ESXi host resources" : service.vcenterVM ? "vCenter VM resources" : "vCenter summary"
        }
      >
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-[100px] flex-1 rounded-sm bg-theme-200/50 dark:bg-theme-900/20 p-1">
            <dt className="text-xs">{label}</dt>
            <dd className="text-sm">{value}</dd>
          </div>
        ))}
      </dl>
      {service.vcenterHost && data.connectionState !== "connected" && (
        <p role="status" className="px-2 pb-2 text-xs">
          Host is not connected; live utilization is unavailable.
        </p>
      )}
      {service.vcenterVM && !["live", "stale", "not-running"].includes(performance.status) && (
        <p role="status" className="px-2 pb-2 text-xs">
          {performanceMessage(performance.status)}
        </p>
      )}
    </div>
  );
}
