import Head from "next/head";
import Link from "next/link";
import { useState } from "react";

import LocalPassword from "components/account/local-password";
import usePreferences from "components/account/preferences";
import GatherIcon from "components/gather/icon";
import GatherMark from "components/gather/mark";
import styles from "components/settings/editor.module.css";

export default function AccountPreferences({ localLogin = false }) {
  const { data, error, mutate } = usePreferences();
  return <AccountPreferencesContent data={data} error={error} mutate={mutate} localLogin={localLogin} />;
}
export function AccountPreferencesContent({ data, error, mutate, request = fetch, localLogin = false }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [saveError, setSaveError] = useState("");
  async function change(widgetsPosition) {
    if (busy || widgetsPosition === data?.widgetsPosition) return;
    setBusy(true);
    setStatus("");
    setSaveError("");
    try {
      const response = await request("/api/gather/preferences", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
        body: JSON.stringify({ widgetsPosition }),
      });
      if (!response.ok) throw Error("Could not save your preference. Try again.");
      await mutate(await response.json(), false);
      setStatus("Saved for your account.");
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.editor}>
      <Head>
        <title>My preferences · Gather</title>
      </Head>
      <header className={styles.top}>
        <Link href="/" className={styles.brand} aria-label="Gather home">
          <GatherMark className={styles.mark} />
          <strong>Gather</strong>
        </Link>
        <Link href="/">Back to dashboard</Link>
      </header>
      <div className={styles.preferencesPage}>
        <span className={styles.eyebrow}>YOUR ACCOUNT</span>
        <h1 className={styles.sectionTitle}>My preferences</h1>
        <p>Choose how Gather works for you. Changes save automatically and follow your account.</p>
        {(error || saveError) && (
          <p className={styles.error} role="alert">
            {error?.message || saveError}
          </p>
        )}
        <section className={styles.card}>
          <h2>Home widget placement</h2>
          <p>Place your greeting, weather and clock around the tab navigation.</p>
          <div className={styles.preferenceChoices} role="group" aria-label="Widget position">
            {["above", "below"].map((position) => (
              <button
                key={position}
                disabled={busy || !data}
                aria-pressed={data?.widgetsPosition === position}
                onClick={() => change(position)}
              >
                <span className={styles.placementPreview} data-position={position} aria-hidden="true">
                  <span className={styles.mockTabs}>Home · Media · Network</span>
                  <span className={styles.mockWidgets}>☀ Weather · Clock</span>
                  <span className={styles.mockContent}>Your services</span>
                </span>
                <strong>{position === "above" ? "Above tabs" : "Below tabs"}</strong>
                <span>{position === "above" ? "See your overview first." : "Keep navigation at the top."}</span>
                {data?.widgetsPosition === position && (
                  <span className={styles.selectionMark}>
                    <GatherIcon name="check" /> Selected
                  </span>
                )}
              </button>
            ))}
          </div>
          <p role="status">{busy ? "Saving…" : status || (!data ? "Loading preferences…" : "")}</p>
        </section>
        {localLogin && <LocalPassword request={request} />}
        <Link href="/notifications" className={styles.preferenceLink}>
          <GatherIcon name="bell" />
          <span>
            <strong>Notifications & app badges</strong>
            <small>Manage delivery, unread counts and how your inbox opens.</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
        <Link href="/dashboard" className={styles.preferenceLink}>
          <GatherIcon name="home" />
          <span>
            <strong>My dashboard</strong>
            <small>Arrange your personal space.</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </main>
  );
}

export async function getServerSideProps() {
  const { localAccountsEnabled } = await import("utils/gather/users-store");
  return { props: { localLogin: localAccountsEnabled() } };
}
