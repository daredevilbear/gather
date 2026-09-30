import { useState } from "react";
import { SWRConfig } from "swr";

import Item from "components/services/item";
import { SettingsContext } from "utils/contexts/settings";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development"
    ? { props: { sampleTime: new Date().toISOString() } }
    : { notFound: true };
}
const service = {
  name: "Example VM",
  description: "vCenter performance preview",
  vcenterServer: "preview",
  vcenterVM: "vm-1",
  showStats: true,
  widgets: [],
};
export default function VcenterPreview({ sampleTime }) {
  const [status, setStatus] = useState("live");
  const data = {
    powerState: status === "not-running" ? "POWERED_OFF" : "POWERED_ON",
    cpus: 4,
    memoryMiB: 8192,
    performance: ["live", "stale"].includes(status)
      ? {
          status,
          cpuPercent: 18.7,
          activeMemoryMiB: 1536,
          consumedMemoryMiB: 4096,
          sampledAt: status === "stale" ? new Date(Date.parse(sampleTime) - 300000).toISOString() : sampleTime,
          intervalSeconds: 20,
        }
      : { status },
  };
  return (
    <main className="max-w-3xl mx-auto p-6 text-theme-700 dark:text-theme-200">
      <h1 className="text-2xl mb-2">vCenter VM and host preview</h1>
      <p className="mb-6">Sample readings only. No vCenter connection is used.</p>
      <label>
        Sample state{" "}
        <select className="text-black mb-6 p-2" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="live">Live sample</option>
          <option value="stale">Older sample</option>
          <option value="permission-denied">Permission denied</option>
          <option value="no-samples">Waiting for samples</option>
          <option value="not-running">VM stopped</option>
        </select>
      </label>
      <SettingsContext.Provider value={{ settings: { showStats: true } }}>
        <SWRConfig
          key={status}
          value={{
            provider: () => new Map(),
            isPaused: () => true,
            fallback: {
              "/api/vcenter/stats?instance=preview&vm=vm-1": data,
              "/api/vcenter/stats?instance=preview&host=host-1": {
                connectionState: "connected",
                health: "green",
                maintenance: false,
                cpuPercent: 24.5,
                usedMemoryMiB: 32768,
                totalMemoryMiB: 131072,
                runningVMs: 15,
                totalVMs: 20,
                checkedAt: sampleTime,
              },
            },
          }}
        >
          <ul>
            <Item service={service} groupName="Preview" />
            <Item
              service={{
                name: "Example ESXi host",
                description: "ESXi host",
                vcenterServer: "preview",
                vcenterHost: "host-1",
                widgets: [],
              }}
              groupName="Preview"
            />
          </ul>
        </SWRConfig>
      </SettingsContext.Provider>
    </main>
  );
}
