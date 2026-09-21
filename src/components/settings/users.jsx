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
      <section className={styles.card}>
        <h3>Add user</h3>
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
                setName("");
                setEmail("");
                setReview(null);
              }}
            >
              Clear form
            </button>
          </fieldset>
        </form>
      </section>
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
      {data.users.map((user) => (
        <section key={user.id} className={styles.card}>
          <h3>{user.name}</h3>
          <p>
            {user.email || "No email supplied"} ·{" "}
            {user.pending ? "Awaiting verified sign-in" : user.enabled ? "Active" : "Disabled"}
          </p>
          <label>
            Role for {user.name}
            <select
              disabled={busy || user.protected}
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
          {user.protected ? (
            <p>Protected server administrator.</p>
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
        </section>
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
