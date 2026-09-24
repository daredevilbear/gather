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
  const sampledAt =
    performance.sampledAt && Number.isFinite(Date.parse(performance.sampledAt))
      ? new Date(performance.sampledAt)
      : null;
  const health = { green: "Healthy", yellow: "Warning", red: "Critical", gray: "Unknown" };
  const checkedAt = data.checkedAt && Number.isFinite(Date.parse(data.checkedAt)) ? new Date(data.checkedAt) : null;
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
      {service.vcenterHost && (
        <div className="px-2 pb-2 text-xs text-theme-600 dark:text-theme-300">
          {checkedAt && (
            <p>
              Checked <time dateTime={checkedAt.toISOString()}>{checkedAt.toISOString().slice(11, 19)} UTC</time>
            </p>
          )}
          <p>
            Health is reported by vCenter. Resource values use its latest host statistics; VM counts reflect the service
            account’s visibility.
          </p>
          {data.connectionState !== "connected" && (
            <p role="status">Host is not connected; live utilization is unavailable.</p>
          )}
        </div>
      )}
      {service.vcenterVM && (
        <div className="px-2 pb-2 text-xs text-theme-600 dark:text-theme-300">
          <p role="status">{performanceMessage(performance.status)}</p>
          {sampledAt && (
            <p>
              Sampled <time dateTime={sampledAt.toISOString()}>{sampledAt.toISOString().slice(11, 19)} UTC</time> ·{" "}
              {performance.intervalSeconds}s interval
            </p>
          )}
          <p>Active memory is estimated guest use; host consumed memory is physical memory used on the host.</p>
        </div>
      )}
    </div>
  );
}
