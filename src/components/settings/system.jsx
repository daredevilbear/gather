import { signIn } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

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
const previewConfig = {
  revision: "preview",
  issuer: "https://accounts.example.com",
  clientId: "gather",
  providerName: "Gather account",
  admins: ["preview-admin"],
  ntfyUrl: "https://ntfy.example.com",
  oidcProviderId: "gather-oidc",
  callbackUrl: "https://dashboard.example.com/api/auth/callback/gather-oidc",
  clientSecretSet: true,
  ntfyAuthSet: true,
  status: { phase: "idle" },
};
async function previewRequest(body) {
  return body
    ? {
        message:
          body.action === "test"
            ? "Preview connection check complete. No live servers were contacted."
            : "Preview saved. No live services were changed.",
      }
    : structuredClone(previewConfig);
}
export default function SystemSettings({ embedded = false, preview = false, onDirtyChange, titleRef }) {
  const request = preview ? previewRequest : call;
  const formRef = useRef(null);
  const Container = embedded ? "section" : "main";
  const [config, setConfig] = useState(null),
    [draft, setDraft] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    let active = true;
    request()
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
  }, [request]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const set = (key, value) => {
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setReview(false);
  };
  async function run(action) {
    if (action !== "confirm" && !validForm()) return;
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
      const result = await request({ action, config: data });
      if (action === "apply") {
        setDirty(false);
        setDraft({ ...draft, clientSecret: "", ntfyAuth: "" });
        setMessage(
          preview
            ? result.message
            : "Apply queued. Services will restart briefly. Refresh this page, sign in again, then confirm the change within 10 minutes. Otherwise the previous configuration will be restored.",
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
  function validForm() {
    const invalid = formRef.current?.querySelector(":invalid");
    if (invalid) {
      invalid.reportValidity();
      invalid.focus();
      return false;
    }
    return true;
  }
  return (
    <Container className={embedded ? styles.systemSection : styles.editor}>
      <header className={embedded ? styles.heading : styles.top}>
        <div>
          <p className={styles.eyebrow}>ADMINISTRATION</p>
          <h2 ref={titleRef} tabIndex={-1} className={styles.sectionTitle}>
            System settings
          </h2>
          <p>Authentication, notification connections and administrator access.</p>
        </div>
        {/* Full navigation preserves the unsaved-change warning. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {!embedded && <a href="/settings">Dashboard settings</a>}
      </header>
      <div
        className={embedded ? undefined : styles.content}
        style={embedded ? undefined : { maxWidth: 900, margin: "auto" }}
      >
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
                Credentials are encrypted in SQLite. Keys are kept separately. Existing secrets are never shown here;
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
                  <button
                    onClick={() =>
                      signIn(config.oidcProviderId, { callbackUrl: "/settings?section=system" }, { prompt: "login" })
                    }
                  >
                    Sign in again
                  </button>
                  <button disabled={busy} onClick={() => run("confirm")}>
                    Confirm working sign-in
                  </button>
                </div>
              )}
            </section>
            <fieldset
              ref={formRef}
              className={styles.form}
              disabled={busy || ["applying", "awaiting_confirmation", "rolling_back"].includes(config.status.phase)}
            >
              <section className={styles.card}>
                <h2>Single sign-on (OIDC)</h2>
                <label>
                  Issuer URL
                  <input type="url" required value={draft.issuer} onChange={(e) => set("issuer", e.target.value)} />
                </label>
                <label>
                  Client ID
                  <input required value={draft.clientId} onChange={(e) => set("clientId", e.target.value)} />
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
                  <input type="url" required value={draft.ntfyUrl} onChange={(e) => set("ntfyUrl", e.target.value)} />
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
                  Choose notification topics and icons in Notifications.
                </p>
              </section>
              <details className={styles.card}>
                <summary>Bootstrap administrators (advanced)</summary>
                <p>
                  Manage people and roles in Users & access. These server identities provide protected recovery access.
                </p>
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
              </details>
              <div className={styles.toolbar}>
                <button onClick={() => run("test")}>Test connections</button>
                <button
                  className={styles.primary}
                  onClick={() => {
                    if (validForm()) setReview(true);
                  }}
                >
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
    </Container>
  );
}
