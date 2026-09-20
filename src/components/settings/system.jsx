import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

import styles from "./editor.module.css";
async function call(body) {
  const r = await fetch("/api/gather/system", {
    credentials: "same-origin",
    cache: "no-store",
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error("The service is restarting or your session expired. Wait a moment and refresh.");
  }
  if (!r.ok) throw Error(data.error || "System settings are unavailable.");
  return data;
}
export default function SystemSettings() {
  const [config, setConfig] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    call()
      .then((c) => {
        if (active) {
          setConfig(c);
          setDraft({ ...c, clientSecret: "", ntfyAuth: "" });
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const set = (key, value) => {
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setReview(false);
  };
  async function run(action) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = {
        revision: config.revision,
        issuer: draft.issuer,
        clientId: draft.clientId,
        providerName: draft.providerName,
        admins: draft.admins.map((id) => id.trim()).filter(Boolean),
        ntfyUrl: draft.ntfyUrl,
        ...(draft.clientSecret ? { clientSecret: draft.clientSecret } : {}),
        ...(draft.ntfyAuth ? { ntfyAuth: draft.ntfyAuth } : {}),
      };
      const result = await call({ action, config: data });
      if (action === "apply") {
        setDirty(false);
        setDraft({ ...draft, clientSecret: "", ntfyAuth: "" });
        setMessage(
          "Apply queued. Services will restart briefly. Refresh this page, sign in again, then confirm the change within 10 minutes. Otherwise the previous configuration will be restored.",
        );
        setReview(false);
      } else if (action === "confirm")
        setMessage(
          "Confirmation accepted. The recovery controller will keep this configuration once services are healthy. Refresh to see the final status.",
        );
      else setMessage(result.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className={styles.editor}>
      <header className={styles.top}>
        <div>
          <p className={styles.eyebrow}>GATHER / SYSTEM</p>
          <h1>System configuration</h1>
          <p>Authentication, notification connections and administrator access.</p>
        </div>
        {/* Full navigation preserves the unsaved-change warning. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/settings">Dashboard settings</a>
      </header>
      <div className={styles.content} style={{ maxWidth: 900, margin: "auto" }}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        {message && (
          <p role="status" className={styles.notice}>
            {message}
          </p>
        )}
        {config && draft && (
          <>
            <section className={styles.card}>
              <h2>Secure storage</h2>
              <p>
                Credentials are encrypted on disk. Keys are kept separately. Existing secrets are never shown here;
                leave a secret field blank to keep it.
              </p>
              <p>
                Status: <strong>{config.status.phase.replaceAll("_", " ")}</strong>
                {config.status.reason ? ` — ${config.status.reason}` : ""}
              </p>
              <button onClick={() => window.location.reload()}>Refresh status</button>
              {config.status.phase === "awaiting_confirmation" && (
                <div className={styles.notice}>
                  <p>
                    Confirm by {new Date(config.status.deadline).toLocaleTimeString()} after signing in with the new
                    configuration. An unconfirmed change rolls back automatically.
                  </p>
                  <button onClick={() => signIn("homepage-oidc", { callbackUrl: "/system" }, { prompt: "login" })}>
                    Sign in again
                  </button>
                  <button disabled={busy} onClick={() => run("confirm")}>
                    Confirm working sign-in
                  </button>
                </div>
              )}
            </section>
            <fieldset
              className={styles.form}
              disabled={busy || ["applying", "awaiting_confirmation", "rolling_back"].includes(config.status.phase)}
            >
              <section className={styles.card}>
                <h2>Single sign-on (OIDC)</h2>
                <label>
                  Issuer URL
                  <input type="url" value={draft.issuer} onChange={(e) => set("issuer", e.target.value)} />
                </label>
                <label>
                  Client ID
                  <input value={draft.clientId} onChange={(e) => set("clientId", e.target.value)} />
                </label>
                <label>
                  Client secret
                  <input
                    autoComplete="new-password"
                    type="password"
                    value={draft.clientSecret}
                    placeholder={config.clientSecretSet ? "Configured — leave blank to keep" : "Not configured"}
                    onChange={(e) => set("clientSecret", e.target.value)}
                  />
                </label>
                <label>
                  Sign-in button name
                  <input value={draft.providerName} onChange={(e) => set("providerName", e.target.value)} />
                </label>
                <label>
                  Callback URL
                  <input readOnly value={config.callbackUrl} />
                </label>
                <p>
                  The callback and dashboard address are fixed by the deployment. Register this exact callback with your
                  identity provider.
                </p>
              </section>
              <section className={styles.card}>
                <h2>Notification connection</h2>
                <label>
                  ntfy server URL
                  <input type="url" value={draft.ntfyUrl} onChange={(e) => set("ntfyUrl", e.target.value)} />
                </label>
                <label>
                  Authorization
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={draft.ntfyAuth}
                    placeholder={
                      config.ntfyAuthSet ? "Configured — leave blank to keep" : "Bearer token or Basic credentials"
                    }
                    onChange={(e) => set("ntfyAuth", e.target.value)}
                  />
                </label>
                <p>
                  Use “Bearer token” or “Basic base64-credentials”. Prefer a read-only token for the subscribed topics.
                  Topic and icon options are under Dashboard settings → Push & topics.
                </p>
              </section>
              <section className={styles.card}>
                <h2>Administrators</h2>
                <label>
                  Account subject IDs (one per line)
                  <textarea
                    rows={4}
                    value={draft.admins.join("\n")}
                    onChange={(e) => set("admins", e.target.value.split("\n"))}
                  />
                </label>
                <p>
                  Use stable OIDC subject IDs, not names or email addresses. Your current administrator identity must
                  remain authorized.
                </p>
              </section>
              <div className={styles.toolbar}>
                <button onClick={() => run("test")}>Test connections</button>
                <button className={styles.primary} onClick={() => setReview(true)}>
                  Review & apply
                </button>
              </div>
            </fieldset>
            {review && (
              <section role="alert" className={styles.notice}>
                <h2>Apply system configuration?</h2>
                <p>
                  Sign-in provider: {draft.issuer}
                  <br />
                  Notification server: {draft.ntfyUrl}
                  <br />
                  Administrators: {draft.admins.filter(Boolean).length}
                </p>
                <p>
                  Services will restart. You must sign in again and confirm within 10 minutes; otherwise the previous
                  configuration will return automatically.
                </p>
                <button disabled={busy} onClick={() => run("apply")}>
                  Apply with automatic rollback
                </button>
                <button onClick={() => setReview(false)}>Cancel</button>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
