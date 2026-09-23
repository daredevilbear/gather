import { useEffect, useState } from "react";

import styles from "./editor.module.css";

const ROLES = [
  ["viewer", "Viewer — read only"],
  ["editor", "Editor — own dashboard"],
  ["admin", "Administrator — manage Gather"],
];
export default function Users({ preview = false, titleRef, onDirtyChange }) {
  const [data, setData] = useState({
    users: preview
      ? [
          {
            id: "preview",
            name: "Preview User",
            email: "preview@example.com",
            role: "admin",
            enabled: true,
            protected: true,
          },
        ]
      : [],
    activity: [],
    canAddUsers: preview,
  });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState("editor");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState(null);
  useEffect(() => {
    const dirty = Boolean(name || email || review);
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [name, email, review, onDirtyChange]);
  async function request(body) {
    const response = await fetch("/api/gather/users", {
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
    if (!response.ok) throw Error(result.error);
    return result;
  }
  useEffect(() => {
    if (preview) return;
    let active = true;
    request()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [preview]);
  async function save(body) {
    setBusy(true);
    setError("");
    try {
      if (preview) {
        setData((previous) => ({
          ...previous,
          users:
            body.action === "add"
              ? [...previous.users, { ...body, id: email, pending: true, enabled: true }]
              : previous.users.map((user) => (user.id === body.id ? { ...user, ...body } : user)),
        }));
      } else setData(await request(body));
      setAdding(false);
      setName("");
      setEmail("");
      setReview(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 ref={titleRef} tabIndex={-1} className={styles.sectionTitle}>
        Users & access
      </h2>
      <p>
        People sign in through your existing identity provider. Add their verified email here to prepare their role;
        this does not create an identity-provider account or send an invitation.
      </p>
      {error && <p role="alert">{error}</p>}
      <details className={styles.card}>
        <summary>Understand access levels</summary>
        <p>
          <strong>Viewer:</strong> browse dashboards and manage personal notification preferences.
        </p>
        <p>
          <strong>Editor:</strong> viewer access plus editing their own dashboard.
        </p>
        <p>
          <strong>Administrator:</strong> manage shared dashboard content, users and secrets. Server configuration and
          connection files require a protected server administrator.
        </p>
      </details>
      <div className={styles.grid}>
        <label>
          Find a person
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or email" />
        </label>
        <label>
          Access status
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="active">Active</option>
            <option value="pending">Awaiting sign-in</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <button disabled={busy || adding || !data.canAddUsers} onClick={() => setAdding(true)}>
          Add user
        </button>
      </div>
      {!data.canAddUsers && <p>Configure OIDC sign-in in System settings to add individual users.</p>}
      {adding && (
        <section className={styles.card}>
          <h3>Prepare a user’s access</h3>
          {!data.canAddUsers && <p>Individual users require OIDC sign-in. A shared password represents one account.</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setReview({ action: "add", name, email, role });
            }}
          >
            <fieldset disabled={busy || !data.canAddUsers}>
              <label>
                Name
                <input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Email
                <input required type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label>
                Role
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy || !name.trim() || !email}>Review new user</button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setName("");
                  setEmail("");
                  setReview(null);
                }}
              >
                Cancel adding user
              </button>
            </fieldset>
          </form>
        </section>
      )}
      {review && (
        <section className={styles.notice} role="alert">
          <h3>Review access change</h3>
          <p>
            {review.name} will have {review.role} access
            {review.enabled === false ? " with sign-in access disabled" : ""}.
          </p>
          <button disabled={busy} onClick={() => save(review)}>
            Confirm access change
          </button>
          <button disabled={busy} onClick={() => setReview(null)}>
            Cancel
          </button>
        </section>
      )}
      <p role="status">
        {data.users.length} {data.users.length === 1 ? "person" : "people"}
      </p>
      {data.users
        .filter(
          (user) =>
            `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()) &&
            (filter === "all" ||
              (filter === "disabled"
                ? !user.enabled
                : filter === "pending"
                  ? user.enabled && user.pending
                  : user.enabled && !user.pending)),
        )
        .map((user) => (
          <details key={user.id} className={styles.card}>
            <summary>
              <strong>{user.name}</strong> · {user.email || "No email supplied"} · {user.role}
              {user.id === data.currentUserId ? " · You" : ""}
            </summary>
            <p>
              {user.email || "No email supplied"} ·{" "}
              {!user.enabled ? "Disabled" : user.pending ? "Awaiting verified sign-in" : "Active"}
            </p>
            <label>
              Role for {user.name}
              <select
                disabled={busy || user.protected || user.id === data.currentUserId}
                value={user.role}
                onChange={(e) =>
                  setReview({
                    action: "update",
                    id: user.id,
                    name: user.name,
                    role: e.target.value,
                    enabled: user.enabled,
                  })
                }
              >
                {ROLES.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {user.protected || user.id === data.currentUserId ? (
              <p>
                {user.protected
                  ? "Protected server administrator."
                  : "Ask another administrator to change your access."}
              </p>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  setReview({ action: "update", id: user.id, name: user.name, role: user.role, enabled: !user.enabled })
                }
              >
                {user.enabled ? "Disable access" : "Enable access"}
              </button>
            )}
            {user.lastSeen && <p>Last active: {new Date(user.lastSeen).toLocaleString()}</p>}
          </details>
        ))}
      <section className={styles.card}>
        <h3>Recent activity</h3>
        <p>Sign-ins, user-access changes and personal dashboard saves are recorded here.</p>
        {!data.activity.length && <p>No recorded activity yet.</p>}
        {data.activity.map((event, index) => (
          <p key={index}>
            {event.actor} · {event.action} · {event.target}
            <br />
            {new Date(event.happened).toLocaleString()}
          </p>
        ))}
      </section>
    </section>
  );
}
