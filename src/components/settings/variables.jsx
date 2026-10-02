import { useEffect, useRef, useState } from "react";

import styles from "./editor.module.css";

export default function Variables({ preview = false, onDirtyChange, titleRef }) {
  const [items, setItems] = useState([]);
  const [available, setAvailable] = useState(preview);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const valueInput = useRef(null);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("secret");
  const [value, setValue] = useState("");
  const dirty = Boolean(name || value);
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (preview) return;
    let active = true;
    fetch("/api/gather/variables", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        return result;
      })
      .then((result) => {
        if (active) {
          setItems(result.variables);
          setAvailable(result.available);
          setError(result.error || "");
        }
      })
      .catch(() => {
        if (active) setError("Could not load variables. Check your access and try again.");
      });
    return () => {
      active = false;
    };
  }, [preview]);
  async function update(body) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (preview) {
        setItems((previous) =>
          body.action === "toggle"
            ? previous.map((item) => (item.name === body.name ? { ...item, enabled: body.enabled } : item))
            : [
                ...previous.filter((item) => item.name !== body.name),
                {
                  name: body.name,
                  kind: body.kind,
                  enabled: true,
                  ...(body.kind === "variable" ? { value: body.value } : {}),
                },
              ],
        );
        setStatus("Preview updated. No secret was stored or sent.");
      } else {
        const response = await fetch("/api/gather/variables", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
          body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        setItems(result.variables);
        setStatus(result.applied ? "Saved and applied." : "Saved. Reload the dashboard to refresh its configuration.");
      }
      setEditing(null);
      setName("");
      setValue("");
      setKind("secret");
    } catch (e) {
      setError(e.message || "Could not save the variable.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (editing) {
      valueInput.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      valueInput.current?.focus({ preventScroll: true });
    }
  }, [editing]);
  const fullName = name.startsWith("GATHER_VAR_") ? name : `GATHER_VAR_${name}`;
  const existing = items.find((item) => item.name === fullName);
  const valid =
    /^GATHER_VAR_[A-Z0-9_]{1,80}$/.test(fullName) && value.length > 0 && (!existing || existing.kind === kind);
  return (
    <section>
      <h2 ref={titleRef} tabIndex={-1} className={styles.sectionTitle}>
        Secrets & variables
      </h2>
      <p>Reuse values in service connections with a placeholder. Secrets are encrypted and never shown again.</p>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <fieldset className={styles.card} disabled={busy || !available}>
        <legend>{editing ? `Replace ${editing}` : "Add a value"}</legend>
        {editing && <p>Enter the new value below. The current value stays active until you save.</p>}
        <label>
          Name
          <input
            autoComplete="off"
            readOnly={Boolean(editing)}
            value={name}
            maxLength={93}
            placeholder="MEDIA_API_KEY"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p>
          Use uppercase letters, numbers and underscores. Reference it as <code>{`{{${fullName}}}`}</code>.
        </p>
        <label>
          Type
          <select value={kind} disabled={Boolean(existing)} onChange={(e) => setKind(e.target.value)}>
            <option value="secret">Secret (masked)</option>
            <option value="variable">Variable (visible to administrators)</option>
          </select>
        </label>
        <label>
          {kind === "secret" ? "Secret value" : "Variable value"}
          <input
            ref={valueInput}
            type={kind === "secret" ? "password" : "text"}
            autoComplete="new-password"
            value={value}
            maxLength={8192}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!valid || busy}
          onClick={() => update({ action: "save", name: fullName, kind, value })}
        >
          {editing ? "Save replacement" : "Save value"}
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setName("");
            setValue("");
            setKind("secret");
          }}
        >
          {editing ? "Cancel replacement" : "Clear form"}
        </button>
      </fieldset>
      <section className={styles.card}>
        <h3>Saved values</h3>
        {!items.length && <p>No managed values yet.</p>}
        {items.map((item) => (
          <div key={item.name} className={styles.savedValue}>
            <strong>{item.name}</strong>
            <p>
              {item.kind === "secret" ? "Secret · value hidden" : `Variable · ${item.value}`} ·{" "}
              {item.enabled ? "Enabled" : "Disabled"}
            </p>
            <code>{`{{${item.name}}}`}</code>
            <div className={styles.moves}>
              <button
                type="button"
                disabled={busy || !available || Boolean(editing)}
                onClick={() => {
                  setEditing(item.name);
                  setName(item.name);
                  setKind(item.kind);
                  setValue(item.kind === "variable" ? item.value : "");
                }}
              >
                Replace value
              </button>
              <button
                type="button"
                disabled={busy || !available || Boolean(editing)}
                onClick={() => update({ action: "toggle", name: item.name, enabled: !item.enabled })}
              >
                {item.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        ))}
      </section>
    </section>
  );
}
