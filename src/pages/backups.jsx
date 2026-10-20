import { signOut, useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import styles from "components/settings/editor.module.css";
async function backupRequest(body) {
  const response = await fetch("/api/gather/backups", {
    cache: "no-store",
    credentials: "same-origin",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Backup operation failed.");
  return result;
}
export default function Backups({ request = backupRequest, refreshInterval = 3000 }) {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.id || session?.user?.email;
  const { data, error, mutate } = useSWR(
    status === "authenticated" && identity ? ["complete-backups", identity] : null,
    () => request(),
    { refreshInterval, shouldRetryOnError: false },
  );
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [file, setFile] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const active = data?.active;
  const pending = active && !["complete", "confirmed", "rolled_back", "failed"].includes(active.phase);
  async function action(body) {
    setBusy(true);
    setMessage("");
    try {
      await request(body);
      await mutate();
      if (body.action === "confirm") setMessage("Confirmation received. The controller will complete the restore after checking service health.");
      setPassword("");
      setRepeat("");
      setConfirmation("");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function inspect(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setMessage("");
    try {
      const upload = await fetch("/api/gather/backups/upload", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Gather-Editor": "1" },
        body: file,
      });
      const result = await upload.json();
      if (!upload.ok) throw Error(result.error);
      await request({ action: "inspect", id: result.id, password });
      setPassword("");
      await mutate();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={`${styles.editor} ${styles.utilityPage}`}>
      <Head>
        <title>Complete backup & restore · Gather</title>
      </Head>
      <Link href="/settings?section=backups">Dashboard Settings</Link>
      <h1>Complete backup & restore</h1>
      <p>
        Protected server administrator access is required. This wizard covers Gather accounts, dashboards, preferences,
        encrypted settings, notification inbox state, subscriptions and their required keys.
      </p>
      <p>
        Backups use AES-256-GCM encryption with a passphrase-derived key. Save the passphrase separately; it cannot be
        recovered. Backups include secrets and must be stored privately.
      </p>
      <p>
        Requires the supported UID 1001 Compose mounts and matching component versions. Restore to the same public
        origin and app version. The external identity provider, ntfy broker history, container definitions and external
        services need separate operator backups. The Gather snapshot is limited to 256 MiB and 10,000 files.
      </p>
      {error && <p role="alert">{error.message}</p>}
      <p role="status">{message}</p>
      {data && (
        <>
          <section className={styles.card}>
            <h2>1. Create an encrypted snapshot</h2>
            <p>
              Gather and its notification companion pause briefly while the controller captures a consistent snapshot,
              then start again.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action({ action: "backup", password });
              }}
            >
              <fieldset disabled={busy || pending}>
                <label>
                  Backup passphrase{" "}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={1024}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <label>
                  Repeat passphrase{" "}
                  <input
                    type="password"
                    autoComplete="new-password"
                    required
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                  />
                </label>
                <label>
                  <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved
                  this passphrase separately.
                </label>
                <button disabled={!saved || password !== repeat || password.length < 12}>Create backup</button>
              </fieldset>
            </form>
          </section>
          <section className={styles.card}>
            <h2>2. Inspect a backup before restore</h2>
            <p>
              Inspection authenticates the encrypted file, checks its database integrity, keys, checksums, public origin
              and version. Inspection does not replace live data.
            </p>
            <form onSubmit={inspect}>
              <fieldset disabled={busy || pending}>
                <label>
                  Gather backup{" "}
                  <input type="file" accept=".gather" required onChange={(e) => setFile(e.target.files[0] || null)} />
                </label>
                <label>
                  Backup passphrase{" "}
                  <input
                    type="password"
                    autoComplete="off"
                    minLength={12}
                    maxLength={1024}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button disabled={!file || password.length < 12}>Upload & validate</button>
              </fieldset>
            </form>
          </section>
          {active && (
            <section className={styles.card}>
              <h2>Current operation: {active.phase.replaceAll("_", " ")}</h2>
              <p role="status">{active.message}</p>
              {active.result && (
                <p>
                  {active.result.files} files · {(active.result.bytes / 1048576).toFixed(1)} MiB · Version{" "}
                  {active.result.version} · {active.result.origin} · {new Date(active.result.created).toLocaleString()}
                </p>
              )}
              {active.phase === "validated" && (
                <>
                  <h3>3. Restore & verify sign-in</h3>
                  <p>
                    Restoring replaces Gather’s current accounts, dashboard data, notification state and keys. The
                    controller first saves an encrypted rollback snapshot. Sign in again within ten minutes and confirm;
                    failed health checks or a missing confirmation restore the previous state.
                  </p>
                  <label>
                    Type RESTORE to replace the current Gather state{" "}
                    <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
                  </label>
                  <button
                    disabled={busy || confirmation !== "RESTORE"}
                    onClick={() => action({ action: "restore", id: active.id })}
                  >
                    Restore this snapshot
                  </button>
                  <button disabled={busy} onClick={() => action({ action: "cancel", id: active.id })}>
                    Cancel restore
                  </button>
                </>
              )}
              {active.phase === "awaiting_confirmation" && (
                <>
                  <p>Confirmation deadline: {new Date(active.deadline).toLocaleTimeString()}</p>
                  <button onClick={() => signOut({ callbackUrl: "/backups" })}>
                    Sign out to verify a fresh sign-in
                  </button>
                  <button disabled={busy} onClick={() => action({ action: "confirm", id: active.id })}>
                    Confirm restored installation
                  </button>
                </>
              )}
            </section>
          )}
          <section className={styles.card}>
            <h2>Saved operations</h2>
            <p>
              Download completed backups before deleting their server copy. At most ten operations are retained. Delete
              old operations to free space.
            </p>
            {!data.jobs.length && <p>No backups yet.</p>}
            {data.jobs.map((job) => (
              <div key={job.id} className="my-4">
                <strong>
                  {new Date(job.created).toLocaleString()} · {job.phase.replaceAll("_", " ")}
                </strong>
                {job.action === "backup" && job.phase === "complete" && (
                  <p>
                    <a href={`/api/gather/backups?download=${job.id}`}>Download encrypted backup</a>
                  </p>
                )}
                {["uploaded", "complete", "confirmed", "rolled_back", "failed"].includes(job.phase) && (
                  <button disabled={busy} onClick={() => action({ action: "delete", id: job.id })}>
                    Delete server copy
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
