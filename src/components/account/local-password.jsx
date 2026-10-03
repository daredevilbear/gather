import Link from "next/link";
import { useState } from "react";

import styles from "components/settings/editor.module.css";

export default function LocalPassword({ request = fetch }) {
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  return (
    <section className={styles.card}>
      <h2>Change password</h2>
      {changed ? (
        <p role="status">
          Password changed. <Link href="/auth/signin?callbackUrl=%2Faccount">Sign in again</Link> with your new password.
        </p>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              const response = await request("/api/gather/password", {
                method: "POST",
                credentials: "same-origin",
                headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
                body: JSON.stringify({ currentPassword, password }),
              });
              const result = await response.json();
              if (!response.ok) throw Error(result.error || "Could not change your password.");
              setCurrent("");
              setPassword("");
              setChanged(true);
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={currentPassword}
                onChange={(event) => setCurrent(event.target.value)}
              />
            </label>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={1024}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <p>Use at least 12 characters. Changing your password signs out existing sessions on all devices.</p>
            <button type="submit">Change password</button>
          </fieldset>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
