import { useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import PushControls from "components/notifications/push";
import styles from "components/settings/editor.module.css";

export async function notificationRequest(path, body) {
  const response = await fetch(`/gather-notifications/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json", "X-Gather-Push": "1" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Notification service unavailable.");
  return data;
}
const date = (value) => (value ? new Date(value * 1000).toLocaleString() : "Not recorded");
export function AlertRules({ data, request, refresh }) {
  const [rules, setRules] = useState(data.rules);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (key, value) => setRules({ ...rules, [key]: value });
  return (
    <section className={styles.card}>
      <h2>Alert delivery rules</h2>
      <p>These rules affect pushes. Every retained alert still appears in your inbox and unread count.</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setMessage("");
          try {
            await request("rules", { account: data.account, rules });
            await refresh();
            setMessage("Alert rules saved.");
          } catch (error) {
            setMessage(error.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy}>
          <label>
            <input
              type="checkbox"
              checked={rules.quietEnabled}
              onChange={(e) => change("quietEnabled", e.target.checked)}
            />{" "}
            Quiet hours
          </label>
          <label>
            Start <input type="time" required value={rules.start} onChange={(e) => change("start", e.target.value)} />
          </label>
          <label>
            End <input type="time" required value={rules.end} onChange={(e) => change("end", e.target.value)} />
          </label>
          <label>
            Time zone{" "}
            <input
              required
              maxLength={80}
              value={rules.timezone}
              onChange={(e) => change("timezone", e.target.value)}
            />
          </label>
          <button type="button" onClick={() => change("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone)}>
            Use this device’s time zone
          </button>
          <fieldset>
            <legend>Muted topics</legend>
            {data.topics.map((topic) => (
              <label key={topic}>
                <input
                  type="checkbox"
                  checked={rules.mutedTopics.includes(topic)}
                  onChange={(e) =>
                    change(
                      "mutedTopics",
                      e.target.checked ? [...rules.mutedTopics, topic] : rules.mutedTopics.filter((t) => t !== topic),
                    )
                  }
                />{" "}
                {topic}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={rules.criticalBypass}
              onChange={(e) => change("criticalBypass", e.target.checked)}
            />{" "}
            Critical alerts bypass quiet hours, muted topics and grouping
          </label>
          <label>
            Critical priority{" "}
            <select value={rules.criticalPriority} onChange={(e) => change("criticalPriority", Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            Group identical alerts{" "}
            <select value={rules.groupSeconds} onChange={(e) => change("groupSeconds", Number(e.target.value))}>
              {[0, 30, 60, 300, 900, 3600].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n} seconds` : "Off"}
                </option>
              ))}
            </select>
          </label>
          <p>
            Grouping waits for the selected window, then sends one notification with the occurrence count. Quiet-hour
            alerts are kept in the inbox without a delayed push. Test notifications bypass these rules.
          </p>
          <button type="submit">Save alert rules</button>
        </fieldset>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
export default function NotificationHealth({ request = notificationRequest, refreshInterval = 15000 }) {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.id || session?.user?.email;
  const { data, error, mutate } = useSWR(
    status === "authenticated" && identity ? ["notification-health", identity] : null,
    () => request("diagnostics"),
    { refreshInterval },
  );
  const [message, setMessage] = useState("");
  async function device(body) {
    try {
      await request("device", { ...body, account: data.account });
      await mutate();
      setMessage("Device updated.");
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <main className={`${styles.editor} ${styles.utilityPage}`}>
      <Head>
        <title>Notification health · Gather</title>
      </Head>
      <Link href="/account">My preferences</Link>
      <h1>Notification health</h1>
      <p>Check this account’s devices, unread badge count and push delivery rules.</p>
      {error && <p role="alert">{error.message}</p>}
      <PushControls api={request} prefix="/gather-notifications/" />
      {data && (
        <>
          <section className={styles.card}>
            <h2>Inbox & delivery</h2>
            <p>
              Expected badge: <strong>{data.expectedBadge ?? "Unavailable"}</strong> · Pending pushes: {data.pending}
            </p>
            <p>Last successful feed poll: {date(data.lastPoll)}</p>
            <p>
              A successful send means the push provider accepted it. Gather cannot confirm a banner or badge appeared on
              the device. The badge counts up to 200 retained unread alerts; push tests do not add unread alerts.
            </p>
            <Link href="/notifications">Open notification inbox</Link>
          </section>
          <section className={styles.card}>
            <h2>Your devices</h2>
            {!data.devices.length && <p>No registered devices. Enable push above on each device you want to notify.</p>}
            {data.devices.map((d) => (
              <Device key={d.id} device={d} save={device} />
            ))}
            <p role="status">{message}</p>
          </section>
          <AlertRules key={data.account} data={data} request={request} refresh={mutate} />
        </>
      )}
      <section className={styles.card}>
        <h2>Recovery checklist</h2>
        <ol>
          <li>On iPhone or iPad, open the installed Home Screen app and enable push once.</li>
          <li>In system notification settings, allow notifications and badges for Gather.</li>
          <li>
            Check the expected count above and the device’s last send. A disabled badge preference makes the expected
            count zero.
          </li>
          <li>If the subscription expired, enable push again. Use reset only if enable cannot recover it.</li>
          <li>
            Close Gather and wait for a real new alert. Reads elsewhere reach a closed device on its next push or app
            open.
          </li>
        </ol>
      </section>
    </main>
  );
}
function Device({ device: d, save }) {
  const [label, setLabel] = useState(d.label);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save({ action: "rename", id: d.id, label });
      }}
    >
      <label>
        Device name <input required maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>
      <p>
        {d.state} · Last connected: {date(d.last_seen)} · Last provider acceptance: {date(d.last_sent)}
      </p>
      {d.last_error && <p>Latest send error: {d.last_error}</p>}
      <button type="submit">Rename</button>
      {!["disabled", "expired", "revoked"].includes(d.state) && (
        <button type="button" onClick={() => save({ action: "revoke", id: d.id })}>
          Revoke this device
        </button>
      )}
      <p>
        Revoking stops delivery and automatic recovery for this subscription. Enabling push explicitly on that device
        registers it again.
      </p>
    </form>
  );
}
