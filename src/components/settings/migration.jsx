import * as yaml from "js-yaml";
import { useEffect, useState } from "react";

import styles from "./editor.module.css";

const FILES = ["settings.yaml", "services.yaml", "bookmarks.yaml", "widgets.yaml"];
export default function Migration({ request, onDirtyChange, titleRef }) {
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
    try {
      if (!FILES.includes(file.name) || file.size > 512 * 1024)
        throw Error("Choose settings.yaml, services.yaml, bookmarks.yaml or widgets.yaml, up to 512 KB.");
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
      const parsed = yaml.load(text, { schema: yaml.JSON_SCHEMA });
      const count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed || {}).length;
      setReview({ file: file.name, text, revision: current.revision, count });
    } catch (e) {
      setError(e.message || "Could not read this configuration.");
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
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
          Homepage YAML file
          <input
            type="file"
            accept=".yaml"
            disabled={busy}
            onChange={(e) => {
              inspect(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p>
          Supported: settings.yaml, services.yaml, bookmarks.yaml and widgets.yaml. Settings imports retain this
          installation’s Gather preferences.
        </p>
        <p>
          Environment placeholders stay intact. Configure their values in Secrets & variables or on the server, and copy
          local images and Docker/Kubernetes connection files separately.
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
            <strong>{review.file}</strong> passed validation with {review.count} top-level entries.
          </p>
          <p>
            This replaces the current file. It does not merge services or bookmarks. Use Backup & restore to undo an
            import.
          </p>
          <button type="button" disabled={busy} onClick={apply}>
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
