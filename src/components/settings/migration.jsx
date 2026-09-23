import * as yaml from "js-yaml";
import { useEffect, useState } from "react";

import styles from "./editor.module.css";

import { CONNECTION_FILES, HOMEPAGE_FILES } from "utils/gather/config-files";
export default function Migration({ request, onDirtyChange, titleRef, canManageConnections = false }) {
  const files = HOMEPAGE_FILES.filter((file) => canManageConnections || !CONNECTION_FILES.includes(file));
  const [acknowledged, setAcknowledged] = useState(false);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    onDirtyChange?.(Boolean(review));
    if (!review) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [review, onDirtyChange]);
  async function inspect(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("");
    setReview(null);
    setAcknowledged(false);
    try {
      if (!files.includes(file.name) || file.size > 512 * 1024)
        throw Error(`Choose ${files.join(", ")}, up to 512 KB.`);
      let text = await file.text();
      const current = await request(null, file.name);
      await request({ action: "validate", file: file.name, text, revision: current.revision });
      if (file.name === "settings.yaml") {
        const existing = yaml.load(current.text, { schema: yaml.JSON_SCHEMA }) || {};
        const incoming = yaml.load(text, { schema: yaml.JSON_SCHEMA }) || {};
        // Keep the destination's native Gather controls; import Homepage appearance and layout.
        if (existing.gather)
          text = yaml.dump({ ...incoming, gather: existing.gather }, { noRefs: true, lineWidth: 120 });
        await request({ action: "validate", file: file.name, text, revision: current.revision });
      }
      const parsed = file.name.endsWith(".yaml") ? yaml.load(text, { schema: yaml.JSON_SCHEMA }) : null;
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
      setReview({ file: file.name, text, revision: current.revision, count });
    } catch (e) {
      setError(e.message || "Could not read this configuration.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    if (review?.file === "custom.js" && !acknowledged) return;
    setBusy(true);
    setError("");
    try {
      const result = await request({ action: "save", file: review.file, text: review.text, revision: review.revision });
      setStatus(
        `${review.file} imported. ${result.applied ? "The dashboard has been refreshed." : "Reload the dashboard to refresh its configuration."} The previous version is in Backup & restore.`,
      );
      setReview(null);
    } catch (e) {
      setError(e.message || "Import failed. Review the file again before retrying.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section>
      <h2 ref={titleRef} tabIndex={-1} className={styles.sectionTitle}>
        Import from Homepage
      </h2>
      <p>
        Import one configuration file at a time. Gather validates it before replacing the matching file and saves a
        backup of the previous version.
      </p>
      <section className={styles.card}>
        <h3>1. Choose a configuration file</h3>
        <label>
          Homepage configuration file
          <input
            type="file"
            accept=".yaml,.css,.js"
            disabled={busy}
            onChange={(e) => {
              inspect(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p>Supported: {files.join(", ")}. Settings imports retain this installation’s Gather preferences.</p>
        <p>
          Environment placeholders stay intact. Configure their values in Secrets & variables or on the server, and copy
          local images, TLS certificate/key files and kubeconfig mounts separately. Connection YAML is supported for
          protected server administrators. MCP is configured through server environment settings; there is no mcp.yaml
          file to import.
        </p>
      </section>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {review && (
        <section className={styles.card}>
          <h3>2. Review and import</h3>
          <p>
            <strong>{review.file}</strong>{" "}
            {review.file.endsWith(".yaml")
              ? `passed syntax and structure validation with ${review.count} top-level entries`
              : "is ready for review"}
            .
          </p>
          <p>
            This replaces the current file. It does not merge services or bookmarks. Use Backup & restore to undo an
            import.
          </p>
          {CONNECTION_FILES.includes(review.file) && (
            <p>
              Connection settings can change discovery and service access. Referenced credentials, network access and
              mounted files must already exist. Validation does not contact these systems.
            </p>
          )}
          {review.file === "custom.js" && (
            <label>
              <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />I have
              reviewed this JavaScript and trust it to run for dashboard users.
            </label>
          )}
          <button type="button" disabled={busy || (review.file === "custom.js" && !acknowledged)} onClick={apply}>
            Import {review.file}
          </button>
          <button type="button" disabled={busy} onClick={() => setReview(null)}>
            Cancel import
          </button>
        </section>
      )}
    </section>
  );
}
