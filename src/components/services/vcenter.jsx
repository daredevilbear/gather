import useSWR from "swr";

const states = { POWERED_ON: "Running", POWERED_OFF: "Stopped", SUSPENDED: "Suspended" };
export function useVcenter(service) {
  const query = new URLSearchParams({ instance: service.vcenterServer });
  if (service.vcenterVM) query.set("vm", service.vcenterVM);
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
  const label = error ? "Unavailable" : data ? states[data.powerState] || "Unknown" : "Loading";
  const color = error ? "text-rose-500" : data?.powerState === "POWERED_ON" ? "text-emerald-500" : "text-orange-400";
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
  const fields = service.vcenterVM
    ? [
        ["Power", states[data.powerState] || "Unknown"],
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
    <dl
      className="flex flex-wrap gap-1 p-1 text-center"
      aria-label={service.vcenterVM ? "vCenter VM resources" : "vCenter summary"}
    >
      {fields.map(([label, value]) => (
        <div key={label} className="flex-1 rounded-sm bg-theme-200/50 dark:bg-theme-900/20 p-1">
          <dt className="text-xs">{label}</dt>
          <dd className="text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
