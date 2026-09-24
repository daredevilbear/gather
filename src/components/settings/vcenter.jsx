import * as yaml from "js-yaml";
import { useEffect, useRef, useState } from "react";

import styles from "./editor.module.css";

import { performanceMessage } from "utils/gather/vcenter-performance-status";
import { addVcenterServices, listVcenterServices, removeVcenterService } from "utils/gather/vcenter-services";
export default function Vcenter({ preview, request, connectionsDirty = false }) {
  const [instances, setInstances] = useState(preview ? ["Example vCenter"] : []),
    [instance, setInstance] = useState(preview ? "Example vCenter" : ""),
    [machines, setMachines] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [cards, setCards] = useState([]);
  const [removal, setRemoval] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hosts, setHosts] = useState([]);
  const [selectedHosts, setSelectedHosts] = useState([]);
  const [hostError, setHostError] = useState("");
  const [inventoryView, setInventoryView] = useState("vms");
  const [summary, setSummary] = useState(true);
  const [groups, setGroups] = useState([]);
  const [group, setGroup] = useState("");
  const [url, setUrl] = useState("");
  const [review, setReview] = useState(null);
  const [performanceCheck, setPerformanceCheck] = useState(null);
  const [status, setStatus] = useState("");
  const reviewRef = useRef(null);
  useEffect(() => {
    if (review) {
      reviewRef.current?.focus({ preventScroll: true });
      reviewRef.current?.scrollIntoView?.({ block: "center", behavior: "instant" });
    }
  }, [review]);
  useEffect(() => {
    let active = true;
    request(null, "services.yaml")
      .then((doc) => {
        if (active) setCards(listVcenterServices(yaml.load(doc.text, { schema: yaml.JSON_SCHEMA }), instance));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [request, instance]);
  async function reloadCards() {
    setBusy(true);
    setError("");
    setRemoval(null);
    try {
      const doc = await request(null, "services.yaml");
      setCards(listVcenterServices(yaml.load(doc.text, { schema: yaml.JSON_SCHEMA }), instance));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function removeCard() {
    setBusy(true);
    setError("");
    try {
      const doc = await request(null, "services.yaml");
      const services = removeVcenterService(yaml.load(doc.text, { schema: yaml.JSON_SCHEMA }), removal);
      const text = yaml.dump(services, { noRefs: true, lineWidth: 120 });
      await request({ action: "validate", file: "services.yaml", text, revision: doc.revision });
      await request({ action: "save", file: "services.yaml", text, revision: doc.revision });
      setCards(listVcenterServices(services, instance));
      setStatus(`${removal.name} removed from the dashboard.`);
      setRemoval(null);
      setReview(null);
    } catch (e) {
      setError(e.message);
      setRemoval(null);
    } finally {
      setBusy(false);
    }
  }
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
        hosts.filter((host) => selectedHosts.includes(host.id)),
      );
      if (!result.added) {
        setStatus("These selections are already on the dashboard.");
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
      setCards(listVcenterServices(yaml.load(review.text, { schema: yaml.JSON_SCHEMA }), instance));
      setReview(null);
      setSelected([]);
      setSelectedHosts([]);
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
    setHosts([]);
    setHostError("");
    setPerformanceCheck(null);
    setReview(null);
    setSelected([]);
    setSelectedHosts([]);
    setStatus("");
    try {
      const [servicesDoc, settingsDoc] = await Promise.all([
        request(null, "services.yaml"),
        request(null, "settings.yaml"),
      ]);
      const services = yaml.load(servicesDoc.text, { schema: yaml.JSON_SCHEMA });
      setCards(listVcenterServices(services, instance));
      const settings = yaml.load(settingsDoc.text, { schema: yaml.JSON_SCHEMA }) || {};
      const available = (Array.isArray(services) ? services : []).flatMap((entry) =>
        Object.keys(entry)
          .filter((name) => Array.isArray(entry[name]))
          .map((name) => ({ name, tab: settings.layout?.[name]?.tab || "All tabs" })),
      );
      setGroups(available);
      setGroup(available[0]?.name || "");
      if (preview) {
        setPerformanceCheck({ status: "live", vmName: "Example VM" });
        setUrl("https://vcenter.example.com/ui");
        setHosts([{ id: "host-1", name: "Example ESXi host", connectionState: "CONNECTED" }]);
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
      setPerformanceCheck(result.performanceCheck);
      setMachines(result.machines);
      setHosts(result.hosts || []);
      setHostError(result.hostError || "");
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
        Link selected VMs or ESXi hosts to service cards with power status and expandable resource details, or add an
        inventory summary. Cards refresh every 30 seconds. Running VM cards also show live CPU usage, active memory,
        host consumed memory, and sample time. Allocations remain visible separately.
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
              setRemoval(null);
              setMachines(null);
              setHosts([]);
              setSelectedHosts([]);
              setHostError("");
              setPerformanceCheck(null);
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
      {performanceCheck && (
        <p role="status">
          {performanceCheck.vmName ? `${performanceCheck.vmName}: ` : ""}
          {performanceMessage(performanceCheck.status)}
          {preview ? " (sample data)" : ""}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
      {machines && (
        <>
          <p role="status">
            {machines.length} virtual machines{preview ? " · sample data" : ""}
          </p>
          <fieldset disabled={busy || connectionsDirty}>
            <legend>Select infrastructure</legend>
            <div className={styles.personalRow}>
              <button type="button" aria-pressed={inventoryView === "vms"} onClick={() => setInventoryView("vms")}>
                Virtual machines ({machines.length})
              </button>
              <button type="button" aria-pressed={inventoryView === "hosts"} onClick={() => setInventoryView("hosts")}>
                Hosts ({hosts.length})
              </button>
            </div>
            <p role="status">
              {selected.length} VMs and {selectedHosts.length} hosts selected
            </p>
            {inventoryView === "hosts" && (
              <>
                {hostError && <p role="alert">{hostError}</p>}
                {!hosts.length && !hostError && <p>No ESXi hosts are visible to this connection.</p>}
                {hosts.map((host) => (
                  <label key={host.id} className={styles.vmChoice}>
                    <input
                      type="checkbox"
                      checked={selectedHosts.includes(host.id)}
                      disabled={!!review}
                      onChange={(event) =>
                        setSelectedHosts(
                          event.target.checked
                            ? [...selectedHosts, host.id]
                            : selectedHosts.filter((id) => id !== host.id),
                        )
                      }
                    />
                    <span>
                      <strong>{host.name}</strong> ·{" "}
                      {host.connectionState === "CONNECTED"
                        ? "Connected"
                        : host.connectionState === "DISCONNECTED"
                          ? "Disconnected"
                          : host.connectionState === "NOT_RESPONDING"
                            ? "Not responding"
                            : "Unknown connection"}
                    </span>
                  </label>
                ))}
                <p>Host cards show connection, maintenance, vCenter health, CPU, memory and VM counts.</p>
              </>
            )}
            {inventoryView === "vms" &&
              machines.map((vm) => (
                <label key={vm.id} className={styles.vmChoice}>
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
            <label className={styles.vmChoice}>
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
              Existing VM and host cards are skipped. Shared cards are visible to dashboard users; personal layouts can
              hide or reorder them.
            </p>
            {!review && (
              <button
                type="button"
                disabled={!!removal || !group || (!summary && !selected.length && !selectedHosts.length)}
                onClick={reviewSelection}
              >
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
      <section aria-label="Existing dashboard cards">
        <h4>On your dashboard</h4>
        <button type="button" disabled={busy || !!review} onClick={reloadCards}>
          Reload dashboard cards
        </button>
        {!cards.length && <p>No cards from this connection are on the dashboard.</p>}
        {cards.map((card) => (
          <div className={styles.personalRow} key={JSON.stringify(card.path)}>
            <span>
              <strong>{card.name}</strong> · {card.group}
            </span>
            <button
              type="button"
              disabled={busy || !!review || !!removal}
              aria-label={`Remove ${card.name} from dashboard`}
              onClick={() => {
                setRemoval(card);
                setStatus("");
              }}
            >
              Remove
            </button>
          </div>
        ))}
        {removal && (
          <div className={styles.notice} role="group" aria-label="Confirm card removal">
            <p>
              Remove {removal.name} from {removal.group}? This removes only its Gather card. A backup is saved for
              restore.
            </p>
            <div className={styles.personalRow}>
              <button type="button" disabled={busy} onClick={removeCard}>
                Remove card
              </button>
              <button type="button" disabled={busy} onClick={() => setRemoval(null)}>
                Cancel removal
              </button>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
