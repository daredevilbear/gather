import { SessionProvider } from "next-auth/react";
import { useState } from "react";
import { SWRConfig } from "swr";

import Backups from "../backups";
import NotificationHealth from "../notification-health";

import { MobileEditor } from "components/account/mobile-layout";
import Freshness, { useFreshnessReporter } from "components/services/freshness";
import styles from "components/settings/editor.module.css";
export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
const rules = {
  quietEnabled: true,
  start: "22:00",
  end: "07:00",
  timezone: "America/Los_Angeles",
  mutedTopics: [],
  criticalBypass: true,
  criticalPriority: 5,
  groupSeconds: 60,
};
const session = { user: { gatherIdentity: "preview", name: "Preview User" }, expires: "2099-01-01" };
function SampleMetric() {
  const report = useFreshnessReporter();
  return (
    <div className="p-4">
      <strong>API requests: 0</strong>
      <p>A real zero remains visible while refresh health is reported separately.</p>
      <button onClick={() => report("sample", "success", 10000)}>Simulate successful refresh</button>
      <button onClick={() => report("sample", "error", 10000)}>Simulate failed refresh</button>
    </div>
  );
}
export default function EnhancementsPreview() {
  const [tab, setTab] = useState("health");
  const [diagnostics, setDiagnostics] = useState(() => ({
    account: "preview",
    expectedBadge: 34,
    pending: 0,
    lastPoll: Date.now() / 1000,
    topics: ["platform", "apps", "backups"],
    rules,
    devices: [
      {
        id: "sample",
        label: "My iPhone",
        state: "active",
        last_seen: Date.now() / 1000 - 200,
        last_sent: Date.now() / 1000 - 15,
      },
    ],
  }));
  const [operation, setOperation] = useState(() => ({
    id: "preview",
    action: "inspect",
    phase: "validated",
    created: Date.now(),
    message: "Backup validated. Review before restoring.",
    result: {
      files: 24,
      bytes: 1048576,
      version: "1.0.4",
      origin: "https://gather.example.test",
      created: new Date().toISOString(),
    },
  }));
  const [provider] = useState(() => new Map());
  async function notificationRequest(path, body) {
    if (path === "config") throw Error("Preview only");
    if (path === "rules") setDiagnostics((prior) => ({ ...prior, rules: body.rules }));
    if (path === "device")
      setDiagnostics((prior) => ({
        ...prior,
        devices: prior.devices.map((d) => ({
          ...d,
          ...(body.action === "rename" ? { label: body.label } : { state: "revoked" }),
        })),
      }));
    return diagnostics;
  }
  async function backupsRequest(body) {
    if (body?.action === "restore")
      setOperation((prior) => ({
        ...prior,
        phase: "awaiting_confirmation",
        deadline: Date.now() + 600000,
        message: "Preview only: no data was replaced.",
      }));
    if (body?.action === "cancel")
      setOperation((prior) => ({ ...prior, phase: "failed", message: "Preview restore cancelled." }));
    return { jobs: [operation], active: operation };
  }
  return (
    <SessionProvider session={session} refetchOnWindowFocus={false}>
      <SWRConfig value={{ provider: () => provider, shouldRetryOnError: false }}>
        <div className={`${styles.editor} ${styles.utilityPage}`} style={{ minHeight: 0, paddingBottom: 8 }}>
          <p>Local enhancement preview · synthetic data · no notifications or restores performed</p>
          <nav aria-label="Enhancement previews">
            {["health", "backups", "mobile", "freshness"].map((name) => (
              <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
                {name}
              </button>
            ))}
          </nav>
        </div>
        {tab === "health" && <NotificationHealth request={notificationRequest} refreshInterval={0} />}
        {tab === "backups" && <Backups request={backupsRequest} refreshInterval={0} />}
        {tab === "mobile" && (
          <main className={`${styles.editor} ${styles.utilityPage}`}>
            <h1>Separate phone layout</h1>
            <MobileEditor
              target="shared"
              catalog={[
                { name: "Everyday", kind: "services", items: ["Home Assistant", "Calendar", "Photos"] },
                { name: "Infrastructure", kind: "services", items: ["Logs", "Backups"] },
              ]}
              refresh={async () => {}}
              request={async (_, options) => ({
                ok: true,
                json: async () => ({ mobileProfiles: { shared: JSON.parse(options.body).mobileProfile.profile } }),
              })}
            />
          </main>
        )}
        {tab === "freshness" && (
          <main className={`${styles.editor} ${styles.utilityPage}`}>
            <h1>Widget freshness</h1>
            <Freshness>
              <SampleMetric />
            </Freshness>
          </main>
        )}
      </SWRConfig>
    </SessionProvider>
  );
}
