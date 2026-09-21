import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import styles from "./inbox.module.css";
import Message from "./message";
import PushControls from "./push";

import GatherIcon from "components/gather/icon";

const validId = (value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
export default function Inbox({ prefix = "/gather-notifications/", fullPage = false }) {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.id || session?.user?.email;
  const [open, setOpen] = useState(fullPage);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [badgeRefresh, setBadgeRefresh] = useState(0);
  const box = useRef(null);
  const target = useRef(null);
  const focused = useRef(null);
  const generation = useRef(0);
  const safePrefix = /^\/[a-zA-Z0-9_-]+\/$/.test(prefix) ? prefix : "/gather-notifications/";
  const api = useCallback(
    async (path, body) => {
      const response = await fetch(safePrefix + path, {
        credentials: "same-origin",
        cache: "no-store",
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json", "X-Gather-Push": "1" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!response.ok) {
        const error = Error("Notifications unavailable");
        error.status = response.status;
        throw error;
      }
      return response.json();
    },
    [safePrefix],
  );
  const { data, error, mutate } = useSWR(
    identity && status === "authenticated" ? ["gather-inbox", identity, safePrefix] : null,
    async () => {
      const [feed, saved] = await Promise.all([api("feed"), api("inbox-state")]);
      return { ...feed, ...saved };
    },
    { refreshInterval: 30000, revalidateOnFocus: true },
  );
  useEffect(() => {
    function resume() {
      if (status !== "authenticated" || document.visibilityState === "hidden") return;
      // Reapply even if SWR returns unchanged data after the app was suspended.
      setBadgeRefresh((value) => value + 1);
      mutate().catch(() => console.warn("[Gather badge] Resume inbox refresh failed"));
    }
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [status, mutate]);
  const { data: linked, error: linkedError } = useSWR(
    identity && selected ? ["gather-message", identity, selected, safePrefix] : null,
    () => api(`message/${selected}`),
    { shouldRetryOnError: false },
  );
  useEffect(() => {
    generation.current += 1;
    // Account transitions reset local mutation state and restore browser preferences.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    setSaveError("");
    let saved = "all";
    try {
      const value = localStorage.getItem(`gather:filter:${identity}`);
      if (["all", "unread", "priority"].includes(value)) saved = value;
    } catch {}
    setFilter(saved);
  }, [identity]);
  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(location.search);
      const id = params.get("notification");
      if (params.get("notifications") === "open" || validId(id)) setOpen(true);
      if (validId(id)) {
        setSelected(id);
        focused.current = null;
      }
    }
    function handoff(event) {
      if (
        event.origin !== location.origin ||
        !["GATHER_OPEN_NOTIFICATION", "BEARNET_OPEN_NOTIFICATION"].includes(event.data?.type) ||
        !validId(event.data.messageId)
      )
        return;
      const url = new URL(location.href);
      url.searchParams.set("notifications", "open");
      url.searchParams.set("notification", event.data.messageId);
      history.replaceState(history.state, "", url.href);
      setSelected(event.data.messageId);
      setOpen(true);
      focused.current = null;
      mutate();
      event.ports?.[0]?.postMessage({ opened: true });
    }
    readLocation();
    window.addEventListener("popstate", readLocation);
    window.addEventListener("pageshow", readLocation);
    navigator.serviceWorker?.addEventListener("message", handoff);
    return () => {
      window.removeEventListener("popstate", readLocation);
      window.removeEventListener("pageshow", readLocation);
      navigator.serviceWorker?.removeEventListener("message", handoff);
    };
  }, [mutate]);
  useEffect(() => {
    function close(event) {
      if (fullPage) return;
      if (event.key === "Escape" || (event.type === "pointerdown" && !box.current?.contains(event.target)))
        setOpen(false);
    }
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", close);
    };
  }, [fullPage]);
  useEffect(() => {
    if (open && target.current && focused.current !== selected) {
      target.current.scrollIntoView?.({ block: "nearest" });
      target.current.focus({ preventScroll: true });
      focused.current = selected;
    }
  }, [selected, data, linked, open]);
  async function save(updates) {
    if (busy || !data?.account) return;
    const current = generation.current;
    setBusy(true);
    setSaveError("");
    try {
      const pairs = Object.entries(updates);
      let saved;
      for (let i = 0; i < pairs.length; i += 200)
        saved = await api("inbox-state", {
          account: data.account,
          updates: Object.fromEntries(pairs.slice(i, i + 200)),
        });
      if (current !== generation.current) return;
      if (saved) await mutate((previous) => ({ ...previous, ...saved }), false);
      if (selected && updates[selected] === "dismissed") {
        setSelected(null);
        const url = new URL(location.href);
        url.searchParams.delete("notification");
        history.replaceState(history.state, "", url);
      }
    } catch {
      if (current === generation.current) setSaveError("Could not save status. Please try again.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  const preferences = { badge: true, pushPage: true, inboxView: "panel", ...data?.preferences };
  const badgeCount = (data?.messages || []).filter((message) => !data?.states?.[message.id]).length;
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    if (status === "unauthenticated" || (data && (!preferences.badge || badgeCount === 0))) {
      navigator.clearAppBadge?.().catch(() => console.warn("[Gather badge] Clear failed"));
    } else if (status === "authenticated" && data && preferences.badge) {
      navigator.setAppBadge(badgeCount).catch(() => console.warn("[Gather badge] Update failed"));
    }
  }, [status, data, preferences.badge, badgeCount, badgeRefresh]);

  async function savePreferences(patch) {
    if (busy || !data?.account) return;
    const current = generation.current;
    setBusy(true);
    setSaveError("");
    try {
      const saved = await api("inbox-state", {
        account: data.account,
        updates: {},
        preferences: { ...preferences, ...patch },
      });
      if (current === generation.current) await mutate((previous) => ({ ...previous, ...saved }), false);
    } catch {
      if (current === generation.current) setSaveError("Could not save notification preferences. Try again.");
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  if (status !== "authenticated" || !identity) return null;
  const states = data?.states || {};
  const messages = [...(data?.messages || [])];
  if (linked?.message && !messages.some((message) => message.id === linked.message.id)) messages.push(linked.message);
  const unread = messages.filter((message) => !states[message.id]).length;
  const visible = messages.filter(
    (message) =>
      message.id === selected ||
      (states[message.id] !== "dismissed" &&
        (filter === "all" ||
          (filter === "unread" && !states[message.id]) ||
          (filter === "priority" && (message.priority || 3) >= 4))),
  );
  const notice =
    saveError ||
    (error
      ? "Notifications unavailable. Please refresh to try again."
      : linkedError?.status === 404
        ? selected?.startsWith("test-")
          ? "This push test has no saved inbox message."
          : "This notification has expired or is no longer available."
        : linkedError
          ? "Could not load the selected message. Please refresh."
          : data
            ? "Latest 200 · 30-day history"
            : "Loading notifications…");
  return (
    <details
      ref={box}
      open={fullPage || open}
      className={fullPage ? styles.fullPage : styles.inbox}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        hidden={fullPage}
        className={styles.summary}
        aria-label={`${unread} unread notifications`}
        onClick={(event) => {
          if (preferences.inboxView === "page" && !fullPage) {
            event.preventDefault();
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full navigation remounts the independent inbox page and clears popup state.
            window.location.assign("/notifications");
          }
        }}
      >
        <GatherIcon name="bell" />
        Notifications{unread ? ` · ${unread}` : ""}
      </summary>
      <section className={styles.panel} aria-label="Notification inbox">
        <div className={styles.actions}>
          <strong>Notifications</strong>
          {fullPage ? (
            <Link href="/">Back to dashboard</Link>
          ) : (
            <>
              <Link href={`/notifications${selected ? `?notification=${encodeURIComponent(selected)}` : ""}`}>
                Expand inbox
              </Link>
              <button type="button" onClick={() => setOpen(false)}>
                Close
              </button>
            </>
          )}
        </div>
        <div className={styles.actions}>
          <select
            aria-label="Filter notifications"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              try {
                localStorage.setItem(`gather:filter:${identity}`, event.target.value);
              } catch {}
            }}
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="priority">High priority</option>
          </select>
          <button
            type="button"
            disabled={busy || !data}
            onClick={() =>
              save(
                Object.fromEntries(
                  messages.filter((message) => !states[message.id]).map((message) => [message.id, "read"]),
                ),
              )
            }
          >
            Mark all read
          </button>
          <button type="button" onClick={() => mutate()}>
            Refresh
          </button>
        </div>
        <small role="status">{notice}</small>
        <details className={styles.preferences}>
          <summary>Notification preferences</summary>
          <label>
            <input
              type="checkbox"
              checked={preferences.badge}
              disabled={busy || !data}
              onChange={(e) => savePreferences({ badge: e.target.checked })}
            />
            Show unread count on the app icon
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.pushPage}
              disabled={busy || !data}
              onChange={(e) => savePreferences({ pushPage: e.target.checked })}
            />
            Open push notifications in the full-page inbox
          </label>
          <label>
            Open inbox as
            <select
              value={preferences.inboxView}
              disabled={busy || !data}
              onChange={(e) => savePreferences({ inboxView: e.target.value })}
            >
              <option value="panel">Compact panel</option>
              <option value="page">Full page</option>
            </select>
          </label>
          <small>App icon badges depend on your device and notification permissions.</small>
          <PushControls api={api} prefix={safePrefix} />
        </details>
        <div className={styles.list}>
          {visible.map((message) => (
            <article
              key={message.id}
              ref={message.id === selected ? target : undefined}
              tabIndex={message.id === selected ? -1 : undefined}
              className={styles.message}
              data-selected={message.id === selected}
              data-unread={!states[message.id]}
            >
              <strong>{message.title || message.topic}</strong>
              <small>
                {message.topic} · {new Date(message.time * 1000).toLocaleString()}
                {message.priority >= 4 ? " · High priority" : ""}
              </small>
              <Message text={message.message} />
              <div className={styles.actions}>
                {/^https:\/\//i.test(message.click || "") && (
                  <a href={message.click} target="_blank" rel="noopener noreferrer">
                    Open
                  </a>
                )}
                {!states[message.id] && (
                  <button type="button" disabled={busy} onClick={() => save({ [message.id]: "read" })}>
                    Mark read
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => save({ [message.id]: "dismissed" })}>
                  Dismiss
                </button>
              </div>
            </article>
          ))}
          {!visible.length && data && <p>You’re all caught up. No notifications in this view.</p>}
        </div>
        <small>Read and dismissed status syncs across devices signed in to this account.</small>
      </section>
    </details>
  );
}
