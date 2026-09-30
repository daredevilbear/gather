import Link from "next/link";
import { useCallback, useState } from "react";
import useSWR from "swr";

import workspaceStyles from "./dashboard-workspace.module.css";

import SettingsEditor from "components/settings/editor";
import styles from "components/settings/editor.module.css";

export async function workspaceRequest(body, file) {
  const response = await fetch(`/api/gather/workspace${file ? `?file=${encodeURIComponent(file)}` : ""}`, {
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
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Dashboard unavailable.");
  return result;
}
export default function DashboardWorkspace({ identity, status, request = workspaceRequest, preview = false }) {
  const { data, error, mutate } = useSWR(status === "authenticated" && identity ? ["workspace", identity] : null, () =>
    request(),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const editRequest = useCallback(
    async (body, file) => {
      const result = await request(body, file);
      if (body?.action === "save") await mutate();
      return result;
    },
    [request, mutate],
  );
  async function action(body) {
    setBusy(true);
    setMessage("");
    try {
      await mutate(await request(body), false);
      setMessage(
        body.action === "current"
          ? "Current dashboard saved. Open Gather home to view it."
          : body.enabled
            ? "Sharing enabled for signed-in Gather users."
            : "Sharing disabled. The old link no longer works.",
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const current = data?.current;
  const sharedLink = data?.share ? `/?dashboard=${data.share}` : "";
  return (
    <>
      <section className={`${styles.editor} ${workspaceStyles.controls}`} aria-label="Dashboard selection and sharing">
        <h1>My dashboard</h1>
        <p>Edit your own dashboard below. Share a view-only link and choose which dashboard opens when you sign in.</p>
        {status === "unauthenticated" && <p>Sign in to manage your dashboard.</p>}
        {error && <p role="alert">{error.message}</p>}
        {message && <p role="status">{message}</p>}
        {data && (
          <details>
            <summary>Choose current dashboard & sharing</summary>
            <fieldset disabled={busy}>
              <p>
                Current dashboard:{" "}
                <strong>
                  {current === "mine"
                    ? "My dashboard"
                    : current === "shared"
                      ? "Shared dashboard"
                      : "A shared personal dashboard"}
                </strong>
              </p>
              <div className={styles.personalRow}>
                <button disabled={current === "mine"} onClick={() => action({ action: "current", target: "mine" })}>
                  Use my dashboard
                </button>
                <button disabled={current === "shared"} onClick={() => action({ action: "current", target: "shared" })}>
                  Use shared dashboard
                </button>
                <Link href="/">Open current dashboard</Link>
                <Link href="/?dashboard=mine">View my dashboard</Link>
              </div>
              <h2>Sharing</h2>
              <p>People who are signed in can view a shared dashboard. Only you can edit it.</p>
              <button disabled={!data.canEdit} onClick={() => action({ action: "sharing", enabled: !data.share })}>
                {data.share ? "Stop sharing" : "Share my dashboard"}
              </button>
              {sharedLink && (
                <label>
                  Share link
                  <input
                    readOnly
                    value={
                      typeof window === "undefined" ? sharedLink : new URL(sharedLink, window.location.origin).href
                    }
                    onFocus={(event) => event.target.select()}
                  />
                </label>
              )}
              <label>
                Shared dashboard link
                <input
                  type="url"
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  placeholder="Paste a Gather dashboard link"
                />
              </label>
              <button
                disabled={!target}
                onClick={() => {
                  try {
                    const url = new URL(target);
                    if (!preview && url.origin !== window.location.origin) throw Error();
                    const token = url.searchParams.get("dashboard");
                    if (!/^[a-f0-9]{48}$/.test(token || "")) throw Error();
                    action({ action: "current", target: token });
                  } catch {
                    setMessage("Paste a shared dashboard link from this Gather site.");
                  }
                }}
              >
                Use this shared dashboard
              </button>
            </fieldset>
          </details>
        )}
      </section>
      {data && !data.canEdit && (
        <p className={styles.notice}>
          You can choose a dashboard to view. Ask an administrator for editor access to customize your own dashboard.
        </p>
      )}
      {data?.canEdit && <SettingsEditor request={editRequest} personal preview={preview} />}
    </>
  );
}
