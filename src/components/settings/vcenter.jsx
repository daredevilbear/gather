import { useEffect, useState } from "react";

import styles from "./editor.module.css";
export default function Vcenter({ preview }) {
  const [instances, setInstances] = useState(preview ? ["Example vCenter"] : []),
    [instance, setInstance] = useState(preview ? "Example vCenter" : ""),
    [machines, setMachines] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (preview) return;
    let active = true;
    fetch("/api/gather/vcenter", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw Error(result.error);
        if (active) {
          setInstances(result.instances);
          setInstance(result.instances[0] || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [preview]);
  async function check() {
    setBusy(true);
    setError("");
    setMachines(null);
    try {
      if (preview) {
        setMachines([{ name: "Example VM", powerState: "POWERED_ON", cpus: 2, memoryMiB: 4096 }]);
        return;
      }
      const response = await fetch("/api/gather/vcenter", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gather-Editor": "1" },
        body: JSON.stringify({ instance }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMachines(result.machines);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card}>
      <h3>Read-only vCenter inventory</h3>
      <p>
        Save your connection below, then reopen this section to load it. Use Secrets & variables for credentials. Use a
        vCenter account with read-only inventory access.
      </p>
      <pre>
        {
          'lab:\n  url: https://vcenter.example.com\n  username: "{{HOMEPAGE_VAR_VCENTER_USER}}"\n  password: "{{HOMEPAGE_VAR_VCENTER_PASSWORD}}"'
        }
      </pre>
      <div className={styles.personalRow}>
        <label>
          Connection
          <select
            value={instance}
            onChange={(e) => {
              setInstance(e.target.value);
              setMachines(null);
            }}
          >
            {instances.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !instance} onClick={check}>
          {busy ? "Checking…" : "Check & load inventory"}
        </button>
      </div>
      {!instances.length && <p>No saved vCenter connections yet.</p>}
      {error && <p role="alert">{error}</p>}
      {machines && (
        <>
          <p role="status">
            {machines.length} virtual machines{preview ? " · sample data" : ""}
          </p>
          {machines.map((vm, i) => (
            <p key={i}>
              <strong>{vm.name}</strong> · {vm.powerState} · {vm.cpus} CPUs · {vm.memoryMiB} MiB
            </p>
          ))}
        </>
      )}
    </section>
  );
}
