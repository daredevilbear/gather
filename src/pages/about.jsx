import { useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import useSWR from "swr";

import { notificationRequest } from "./notification-health";

import styles from "components/settings/editor.module.css";

export function componentWarnings(app, notification, controller, now = Date.now()) {
  return [
    notification &&
      notification.version !== "unknown" &&
      notification.version !== app.version &&
      "The notification companion and app have different versions.",
    controller?.version &&
      controller.version !== app.version &&
      "The recovery controller and app have different versions.",
    notification?.revision &&
      app.revision &&
      !["unknown", "development"].includes(app.revision) &&
      notification.revision !== "unknown" &&
      notification.revision !== app.revision &&
      "The notification companion and app were built from different commits.",
    controller?.revision &&
      app.revision &&
      !["unknown", "development"].includes(app.revision) &&
      controller.revision !== "unknown" &&
      controller.revision !== app.revision &&
      "The recovery controller and app were built from different commits.",
    !controller?.heartbeat || now - controller.heartbeat > 20000
      ? "The recovery controller is unavailable or out of date."
      : null,
  ].filter(Boolean);
}
export default function About() {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.email;
  const { data, error } = useSWR(
    status === "authenticated" && identity ? ["about", identity] : null,
    async () => {
      const response = await fetch("/api/gather/about", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      return result;
    },
    { refreshInterval: 15000 },
  );
  const { data: companion, error: companionError } = useSWR(
    data ? ["about-notifications", identity] : null,
    () => notificationRequest("diagnostics"),
    { refreshInterval: 15000, shouldRetryOnError: false },
  );
  return (
    <main className={`${styles.editor} ${styles.utilityPage}`}>
      <Head>
        <title>About & updates · Gather</title>
      </Head>
      <Link href="/">Back to dashboard</Link>
      <h1>About & updates</h1>
      {error && <p role="alert">{error.message}</p>}
      {data && (
        <>
          <section className={styles.card}>
            <h2>Installed components</h2>
            <dl>
              {[
                ["App", data.app],
                ["Notifications", companion],
                ["Recovery controller", data.controller],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {value?.version || "Unavailable"} · Revision {value?.revision?.slice(0, 12) || "unknown"}
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Channel: {data.app.channel} · Build label: {data.app.build}
            </p>
            {componentWarnings(data.app, companion, data.controller).map((warning) => (
              <p role="alert" key={warning}>
                {warning}
              </p>
            ))}
            {companionError && (
              <p>
                Notification companion unavailable. This installation may have notifications disabled or need a
                companion update.
              </p>
            )}
            <p>Updates are installed by the server operator. Update all three component images together.</p>
            <a href={data.releases} target="_blank" rel="noreferrer">
              Published releases
            </a>
          </section>
          <section className={styles.card}>
            <h2>Included release notes</h2>
            <pre className="whitespace-pre-wrap text-sm">
              {data.notes || "Read the published releases for release notes."}
            </pre>
          </section>
        </>
      )}
    </main>
  );
}
