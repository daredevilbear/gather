import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";

import styles from "./editor.module.css";

import { addVcenterServices } from "utils/gather/vcenter-services";
export default function Vcenter({ preview, request, connectionsDirty = false }) {
  const [instances, setInstances] = useState(preview ? ["Example vCenter"] : []),
    [instance, setInstance] = useState(preview ? "Example vCenter" : ""),
    [machines, setMachines] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState([]);
  const [summary, setSummary] = useState(true);
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState("");
  const [url, setUrl] = useState("");
  const [review, setReview] = useState(null);
  const [status, setStatus] = useState("");
  const reviewRef = useRef(null);
  useEffect(() => {
    if (review) {
      reviewRef.current?.focus({ preventScroll: true });
      reviewRef.current?.scrollIntoView?.({ block: "center", behavior: "instant" });
    }
  }, [review]);
  async function reviewSelection() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const doc = await request(null, "services.yaml");
      const result = addVcenterServices(
        yaml.load(doc.text, { schema: yaml.JSON_SCHEMA }),
        group,
        instance,
        machines.filter((vm) => selected.includes(vm.id)),
        summary,
        url,
      );
      if (!result.added) {
        setStatus("These VMs and summary are already on the dashboard.");
        return;
      }
      const text = yaml.dump(result.services, { noRefs: true, lineWidth: 120 });
      await request({ action: "validate", file: "services.yaml", text, revision: doc.revision });
      setReview({ text, revision: doc.revision, added: result.added });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function applySelection() {
    setBusy(true);
    setError("");
    try {
      const result = await request({
        action: "save",
        file: "services.yaml",
        text: review.text,
        revision: review.revision,
      });
      setStatus(
        `${review.added} cards added to ${group}. ${result.applied ? "Dashboard updated." : "Reload the dashboard to see them."}`,
      );
      setReview(null);
      setSelected([]);
    } catch (e) {
      setError(e.message);
      setReview(null);
    } finally {
      setBusy(false);
    }
  }
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
    setReview(null);
    setSelected([]);
    setStatus("");
    try {
      const [servicesDoc, settingsDoc] = await Promise.all([
        request(null, "services.yaml"),
        request(null, "settings.yaml"),
      ]);
      const services = yaml.load(servicesDoc.text, { schema: yaml.JSON_SCHEMA });
      const settings = yaml.load(settingsDoc.text, { schema: yaml.JSON_SCHEMA }) || {};
      const available = (Array.isArray(services) ? services : []).flatMap((entry) =>
        Object.keys(entry)
          .filter((name) => Array.isArray(entry[name]))
          .map((name) => ({ name, tab: settings.layout?.[name]?.tab || "All tabs" })),
      );
      setGroups(available);
      setGroup(available[0]?.name || "");
      if (preview) {
        setUrl("https://vcenter.example.com/ui");
        setMachines([{ id: "vm-1", name: "Example VM", powerState: "POWERED_ON", cpus: 2, memoryMiB: 4096 }]);
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
      setUrl(result.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.card}>
      <h3>vCenter dashboard services</h3>
      <p>
        Save your connection below, then reopen this section to load it. Use Secrets & variables for credentials. Use a
        vCenter account with read-only inventory access.
      </p>
      <p>
        Link selected VMs to service cards with power status and expandable resource details, or add an inventory
        summary. Cards refresh every 30 seconds. CPU and memory show allocation, not live utilization.
      </p>
      {connectionsDirty && <p role="status">Save & apply your connection changes before loading inventory.</p>}
      <pre>
        {
          'lab:\n  url: https://vcenter.example.com\n  username: "{{HOMEPAGE_VAR_VCENTER_USER}}"\n  password: "{{HOMEPAGE_VAR_VCENTER_PASSWORD}}"'
        }
      </pre>
      <div className={styles.personalRow}>
        <label>
          Connection
          <select
            disabled={busy}
            value={instance}
            onChange={(e) => {
              setInstance(e.target.value);
              setMachines(null);
              setReview(null);
              setSelected([]);
              setStatus("");
            }}
          >
            {instances.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <button type="button" disabled={busy || !instance || connectionsDirty} onClick={check}>
          {busy ? "Checking…" : "Check & load inventory"}
        </button>
      </div>
      {!instances.length && <p>No saved vCenter connections yet.</p>}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {machines && (
        <>
          <p role="status">
            {machines.length} virtual machines{preview ? " · sample data" : ""}
          </p>
          <fieldset disabled={busy || connectionsDirty}>
            <legend>Select virtual machines</legend>
            {machines.map((vm) => (
              <label key={vm.id} className={styles.personalRow}>
                <input
                  type="checkbox"
                  checked={selected.includes(vm.id)}
                  disabled={!!review}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, vm.id] : selected.filter((id) => id !== vm.id))
                  }
                />
                <span>
                  <strong>{vm.name}</strong> ·{" "}
                  {vm.powerState === "POWERED_ON"
                    ? "Running"
                    : vm.powerState === "POWERED_OFF"
                      ? "Stopped"
                      : vm.powerState === "SUSPENDED"
                        ? "Suspended"
                        : "Unknown"}{" "}
                  · {vm.cpus} CPUs · {vm.memoryMiB / 1024} GiB allocated
                </span>
              </label>
            ))}
            <label className={styles.personalRow}>
              <input
                type="checkbox"
                checked={summary}
                disabled={!!review}
                onChange={(e) => setSummary(e.target.checked)}
              />
              Add vCenter summary card
            </label>
            <label>
              Destination tab / group
              <select value={group} disabled={!!review} onChange={(e) => setGroup(e.target.value)}>
                {groups.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.tab} / {item.name}
                  </option>
                ))}
              </select>
            </label>
            {!groups.length && <p>Create a group in Services first, then reload inventory.</p>}
            <p>
              Cards link to vCenter. Change their Service URL in Services to open the application hosted by a VM.
              Existing VM cards are skipped. Shared cards are visible to dashboard users; personal layouts can hide or
              reorder them.
            </p>
            {!review && (
              <button type="button" disabled={!group || (!summary && !selected.length)} onClick={reviewSelection}>
                Review dashboard cards
              </button>
            )}
            {review && (
              <section ref={reviewRef} tabIndex={-1} className={styles.notice} aria-label="Review dashboard cards">
                <p>
                  Add {review.added} cards to {group}. Existing services are retained; a backup is created when saved.
                </p>
                <div className={styles.personalRow}>
                  <button type="button" onClick={applySelection}>
                    Add to dashboard
                  </button>
                  <button type="button" onClick={() => setReview(null)}>
                    Cancel
                  </button>
                </div>
              </section>
            )}
          </fieldset>
        </>
      )}
    </section>
  );
}
