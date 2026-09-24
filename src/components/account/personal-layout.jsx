import Head from "next/head";
import Link from "next/link";
import { useEffect, useState } from "react";
import useSWR from "swr";

import GatherMark from "components/gather/mark";
import styles from "components/settings/editor.module.css";
import { DragHandle, moveTo, useOrdering } from "components/settings/ordering";
import { initialPersonalLayout, validPersonalLayout } from "utils/gather/personal-layout";

export async function personalRequest(path, body) {
  const response = await fetch(path, {
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
export default function PersonalLayout({ identity, status, request = personalRequest }) {
  const enabled = status === "authenticated" && identity;
  const { data, error, mutate } = useSWR(enabled ? ["my-dashboard", identity] : null, () =>
    request("/api/gather/dashboard"),
  );
  const { data: catalog, error: catalogError } = useSWR(enabled ? ["layout-catalog", identity] : null, () =>
    request("/api/gather/layout-catalog"),
  );
  const [draft, setDraft] = useState(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [saveError, setSaveError] = useState(""),
    [newTab, setNewTab] = useState("");
  const layout = draft || data?.dashboard?.layout || (catalog ? initialPersonalLayout(catalog) : null);
  const invalidDraft = draft && !validPersonalLayout(draft);
  const update = (value) => {
    setDraft(value);
    setMessage("");
  };
  const ordering = useOrdering((scope, from, to) => {
    if (scope === "groups" || scope === "tabs" || scope === "widgets")
      update({ ...layout, [scope]: moveTo(layout[scope], from, to) });
    else {
      const index = Number(scope.split(":")[1]);
      update({
        ...layout,
        groups: layout.groups.map((g, i) => (i === index ? { ...g, items: moveTo(g.items, from, to) } : g)),
      });
    }
  });
  useEffect(() => {
    if (!draft) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [draft]);
  async function save(next) {
    setBusy(true);
    setSaveError("");
    try {
      if (next && !validPersonalLayout(next))
        throw Error("Use nonempty, unique tab names and assign groups to existing tabs.");
      const result = await request("/api/gather/dashboard", {
        dashboard: { ...data.dashboard, layout: next },
        revision: data.revision,
      });
      await mutate(result, false);
      setDraft(null);
      setMessage(
        next
          ? "Your layout is saved. It will appear on Gather home whenever you sign in."
          : "Your dashboard now follows the shared layout.",
      );
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const changeGroup = (index, values) =>
    update({ ...layout, groups: layout.groups.map((g, i) => (i === index ? { ...g, ...values } : g)) });
  return (
    <main className={styles.editor}>
      <Head>
        <title>My dashboard · Gather</title>
      </Head>
      <header className={styles.top}>
        <Link href="/" aria-label="Gather home" className={styles.brand}>
          <GatherMark className={styles.mark} />
          <strong>Gather</strong>
        </Link>
        <Link href="/">View my dashboard</Link>
        <Link href="/?shared=1">View shared layout</Link>
      </header>
      <div className={styles.preferencesPage}>
        <h1>My dashboard</h1>
        <p>
          Choose your tabs, arrange groups and pick what appears on your home page. These choices follow your account.
          Services and connections are managed by your administrator.
        </p>
        <p>Hiding an item changes your view; it does not change access to that service.</p>
        {(error || catalogError || saveError) && (
          <p role="alert">{saveError || error?.message || catalogError?.message}</p>
        )}
        <p role="status">{message || ordering.announcement}</p>
        {!layout && !error && !catalogError && <p>Loading your layout…</p>}
        {data && !data.canEdit && (
          <p>
            Your Viewer role can use the dashboard. Ask an administrator for Editor access to customize this layout.
          </p>
        )}
        {layout && catalog && (
          <fieldset disabled={busy || !data?.canEdit}>
            <section className={styles.card}>
              <h2>Tabs</h2>
              {layout.tabs.map((tab, index) => (
                <div key={index} className={styles.personalRow} {...ordering.target("tabs", index)}>
                  <DragHandle {...ordering.handle("tabs", index, tab, layout.tabs.length)} />
                  <label>
                    Tab name
                    <input
                      aria-label={`Tab name ${index + 1}`}
                      value={tab}
                      maxLength={80}
                      onChange={(e) => {
                        const next = e.target.value;
                        update({
                          ...layout,
                          tabs: layout.tabs.map((t, i) => (i === index ? next : t)),
                          groups: layout.groups.map((g) => (g.tab === tab ? { ...g, tab: next } : g)),
                        });
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        ...layout,
                        tabs: layout.tabs.filter((_, i) => i !== index),
                        groups: layout.groups.map((g) => (g.tab === tab ? { ...g, tab: "" } : g)),
                      })
                    }
                  >
                    Remove {tab}
                  </button>
                </div>
              ))}
              <div className={styles.personalRow}>
                <label>
                  New tab
                  <input value={newTab} maxLength={80} onChange={(e) => setNewTab(e.target.value)} />
                </label>
                <button
                  type="button"
                  disabled={!newTab.trim() || layout.tabs.includes(newTab.trim())}
                  onClick={() => {
                    update({ ...layout, tabs: [...layout.tabs, newTab.trim()] });
                    setNewTab("");
                  }}
                >
                  Add tab
                </button>
              </div>
            </section>
            <section className={styles.card}>
              <h2>Services & bookmarks</h2>
              <p>Drag a handle to reorder. Use Alt + Up or Down on a handle with the keyboard.</p>
              {layout.groups.map((group, index) => {
                const source = catalog.groups.find((g) => g.name === group.name && g.kind === group.kind);
                return (
                  <details
                    key={`${group.kind}:${group.name}`}
                    className={styles.card}
                    {...ordering.target("groups", index)}
                  >
                    <summary>
                      <DragHandle
                        {...ordering.handle("groups", index, source?.label || group.name, layout.groups.length)}
                      />{" "}
                      {source?.label || group.name} · {group.kind}
                      {!source ? " · no longer available" : ""}
                    </summary>
                    <label>
                      <input
                        type="checkbox"
                        checked={!group.hidden}
                        onChange={(e) => changeGroup(index, { hidden: !e.target.checked })}
                      />
                      Show this group
                    </label>
                    <div className={styles.grid}>
                      <label>
                        Tab
                        <select value={group.tab} onChange={(e) => changeGroup(index, { tab: e.target.value })}>
                          <option value="">Every tab</option>
                          {layout.tabs.map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Columns
                        <select
                          value={group.columns}
                          onChange={(e) => changeGroup(index, { columns: Number(e.target.value) })}
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                            <option key={n}>{n}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {[...group.items, ...(source?.items || []).filter((name) => !group.items.includes(name))].map(
                      (name, itemIndex) => (
                        <div
                          key={name}
                          className={styles.personalRow}
                          {...ordering.target(`items:${index}`, itemIndex)}
                        >
                          {group.items.includes(name) && (
                            <DragHandle {...ordering.handle(`items:${index}`, itemIndex, name, group.items.length)} />
                          )}
                          <label>
                            <input
                              type="checkbox"
                              checked={group.items.includes(name)}
                              onChange={(e) =>
                                changeGroup(index, {
                                  items: e.target.checked
                                    ? [...group.items, name]
                                    : group.items.filter((n) => n !== name),
                                })
                              }
                            />
                            {name}
                          </label>
                        </div>
                      ),
                    )}
                  </details>
                );
              })}
              {catalog.groups
                .filter((g) => !layout.groups.some((choice) => choice.kind === g.kind && choice.name === g.name))
                .map(({ label, ...group }) => (
                  <button
                    key={`${group.kind}:${group.name}`}
                    type="button"
                    onClick={() =>
                      update({
                        ...layout,
                        groups: [
                          ...layout.groups,
                          { ...group, tab: layout.tabs.includes(group.tab) ? group.tab : "", hidden: false },
                        ],
                      })
                    }
                  >
                    Add {label}
                  </button>
                ))}
            </section>
            <section className={styles.card}>
              <h2>Home widgets</h2>
              {[
                ...layout.widgets,
                ...catalog.widgets.map((w) => w.key).filter((key) => !layout.widgets.includes(key)),
              ].map((key, index) => (
                <div key={key} className={styles.personalRow} {...ordering.target("widgets", index)}>
                  {layout.widgets.includes(key) && (
                    <DragHandle
                      {...ordering.handle(
                        "widgets",
                        index,
                        catalog.widgets.find((w) => w.key === key)?.label || key,
                        layout.widgets.length,
                      )}
                    />
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={layout.widgets.includes(key)}
                      onChange={(e) =>
                        update({
                          ...layout,
                          widgets: e.target.checked
                            ? [...layout.widgets, key]
                            : layout.widgets.filter((w) => w !== key),
                        })
                      }
                    />
                    {catalog.widgets.find((w) => w.key === key)?.label || `${key} (unavailable)`}
                  </label>
                </div>
              ))}
              {!catalog.widgets.length && <p>No home widgets have been configured yet.</p>}
            </section>
            <div className={`${styles.personalRow} ${styles.personalSave}`}>
              {invalidDraft && <p role="alert">Use nonempty, unique tab names and assign groups to existing tabs.</p>}
              <button type="button" disabled={!draft || busy || invalidDraft} onClick={() => save(draft)}>
                Save my layout
              </button>
              <button
                type="button"
                disabled={!draft || busy}
                onClick={() => {
                  setDraft(null);
                  setSaveError("");
                }}
              >
                Reset changes
              </button>
              <button type="button" disabled={busy || (!data?.dashboard?.layout && !draft)} onClick={() => save(null)}>
                Use shared layout
              </button>
            </div>
          </fieldset>
        )}
        {!!data?.dashboard?.links?.length && (
          <section className={styles.card}>
            <h2>Your saved private links</h2>
            {data.dashboard.links.map((link, i) => (
              <p key={i}>
                <a href={link.url}>{link.name}</a>
              </p>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
