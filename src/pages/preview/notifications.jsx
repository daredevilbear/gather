import { useState } from "react";

import styles from "components/notifications/inbox.module.css";
import previewStyles from "components/settings/preview.module.css";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
export default function NotificationPreview() {
  const [notice, setNotice] = useState("");
  return (
    <>
      <div className={previewStyles.banner}>Notification spacing preview · sample controls · no notifications sent</div>
      <main
        style={{
          padding: 24,
          background: "#121c27",
          "--panel-bg": "#182938",
          "--panel-text": "#f1f5f2",
          "--control-bg": "#263c49",
          minHeight: "100vh",
        }}
      >
        <section
          className={styles.panel}
          style={{ position: "relative", top: 0, right: 0 }}
          aria-label="Notification preview"
        >
          <div className={styles.actions}>
            <strong>Notifications</strong>
            <button onClick={() => setNotice("This is the compact inbox preview.")}>Expand inbox</button>
            <button onClick={() => setNotice("Preview remains open for review.")}>Close</button>
          </div>
          <div className={styles.actions}>
            <select aria-label="Filter notifications">
              <option>Unread</option>
              <option>All notifications</option>
            </select>
            <button onClick={() => setNotice("Sample notifications marked as read.")}>Mark all read</button>
            <button onClick={() => setNotice("Sample view refreshed.")}>Refresh</button>
          </div>
          <section aria-label="Push notifications">
            <div className={styles.actions}>
              <button onClick={() => setNotice("Sample control only; device settings unchanged.")}>
                Disable push on this device
              </button>
              <button onClick={() => setNotice("Sample control only; no test notification sent.")}>
                Send test notification
              </button>
            </div>
          </section>
          <p role="status">{notice || "Buttons wrap with consistent spacing on narrow screens."}</p>
        </section>
      </main>
    </>
  );
}
