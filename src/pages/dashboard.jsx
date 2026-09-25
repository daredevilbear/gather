import { useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import DashboardWorkspace from "components/account/dashboard-workspace";
import styles from "components/settings/editor.module.css";

async function dashboardRequest(body) {
  const response = await fetch("/api/gather/dashboard", {
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
  if (!response.ok) throw Error(result.error || "Could not load your dashboard.");
  return result;
}
export default function PersonalDashboard() {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.email;
  return <DashboardWorkspace key={identity || "signed-out"} identity={identity} status={status} />;
}
export function PersonalDashboardContent({ identity, status, request = dashboardRequest }) {
  const { data, error, mutate } = useSWR(
    status === "authenticated" && identity ? ["my-dashboard", identity] : null,
    () => request(),
  );
  const [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [tab, setTab] = useState("");
  useEffect(() => {
    if (!draft) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await request({ dashboard: draft, revision: data.revision });
      await mutate(result, false);
      setDraft(null);
      setMessage("Dashboard saved.");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  const dashboard = draft || data?.dashboard;
  const tabs = [...new Set((dashboard?.links || []).map((link) => link.tab).filter(Boolean))];
  return (
    <main className={styles.editor}>
      <Head>
        <title>My dashboard · Gather</title>
      </Head>
      <header className={styles.top}>
        <h1>{dashboard?.title || "My dashboard"}</h1>
        <Link href="/">Shared dashboard</Link>
        <Link href="/account">My preferences</Link>
      </header>
      <p>Your personal links are separate from the shared dashboard and other users’ dashboards.</p>
      {error && <p role="alert">{error.message}</p>}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p>Loading your dashboard…</p>}
      {data?.canEdit && !draft && (
        <button onClick={() => setDraft(structuredClone(data.dashboard))}>Edit my dashboard</button>
      )}
      {draft ? (
        <form onSubmit={save}>
          <fieldset disabled={busy}>
            <label>
              Dashboard title
              <input
                required
                maxLength={120}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            {draft.links.map((link, index) => (
              <section key={index} className={styles.card}>
                {[
                  ["name", "Name"],
                  ["url", "URL"],
                  ["description", "Description"],
                  ["tab", "Tab"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      required={["name", "url"].includes(key)}
                      type={key === "url" ? "url" : "text"}
                      maxLength={key === "url" ? 2048 : key === "description" ? 500 : key === "tab" ? 80 : 120}
                      value={link[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          links: draft.links.map((item, i) =>
                            i === index ? { ...item, [key]: e.target.value } : item,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, links: draft.links.filter((_, i) => i !== index) })}
                >
                  Remove {link.name || "link"}
                </button>
              </section>
            ))}
            <button
              type="button"
              disabled={draft.links.length >= 100}
              onClick={() =>
                setDraft({ ...draft, links: [...draft.links, { name: "", url: "https://", description: "", tab: "" }] })
              }
            >
              Add link
            </button>
            <button type="submit">Save dashboard</button>
            <button type="button" onClick={() => setDraft(null)}>
              Cancel edits
            </button>
          </fieldset>
        </form>
      ) : (
        <>
          {tabs.length > 0 && (
            <nav aria-label="Personal dashboard tabs">
              <button aria-pressed={!tab} onClick={() => setTab("")}>
                All
              </button>
              {tabs.map((name) => (
                <button key={name} aria-pressed={tab === name} onClick={() => setTab(name)}>
                  {name}
                </button>
              ))}
            </nav>
          )}
          <div className={styles.grid}>
            {dashboard?.links
              .filter((link) => !tab || !link.tab || link.tab === tab)
              .map((link, index) => (
                <article key={index} className={styles.card}>
                  <h2>
                    <a href={link.url} rel="noopener noreferrer">
                      {link.name}
                    </a>
                  </h2>
                  <p>{link.description}</p>
                </article>
              ))}
          </div>
          {data && !dashboard?.links.length && (
            <p>
              No personal links yet.
              {!data.canEdit && " Ask an administrator for editor access to customize this dashboard."}
            </p>
          )}
        </>
      )}
    </main>
  );
}
