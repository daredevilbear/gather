import Head from "next/head";
import Link from "next/link";
import { useState } from "react";

import usePreferences from "components/account/preferences";
import styles from "components/settings/editor.module.css";

export default function AccountPreferences() {
  const { data, error, mutate } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function change(widgetsPosition) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/gather/preferences", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
        body: JSON.stringify({ widgetsPosition }),
      });
      if (!response.ok) throw Error("Could not save your preference. Try again.");
      await mutate(await response.json(), false);
      setStatus("Preference saved for your account.");
    } catch (e) { setStatus(e.message); }
    finally { setBusy(false); }
  }
  return <main className={styles.editor}>
    <Head><title>My preferences · Gather</title></Head>
    <header className={styles.top}><h1>My preferences</h1><Link href="/">Back to dashboard</Link></header>
    <section className={styles.card}>
      <h2>Home widgets</h2>
      <p>Choose where your greeting, weather and other Home widgets appear.</p>
      <label>Widget position
        <select disabled={busy || !data} value={data?.widgetsPosition || "below"} onChange={(e) => change(e.target.value)}>
          <option value="above">Above tabs</option><option value="below">Below tabs</option>
        </select>
      </label>
      <p role="status">{error ? error.message : status || (!data ? "Loading preferences…" : "")}</p>
    </section>
    <section className={styles.card}><h2>Notifications</h2>
      <p>Manage app icon badges, push delivery and your preferred inbox view.</p>
      <Link href="/notifications">Open notification preferences</Link>
    </section>
  </main>;
}
