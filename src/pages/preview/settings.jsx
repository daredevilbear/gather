import { useState } from "react";

import { AccountMenuView } from "components/account/menu";
import SettingsEditor from "components/settings/editor";
import { createPreviewStore } from "components/settings/preview-store";
import styles from "components/settings/preview.module.css";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}

export default function SettingsPreview() {
  const [request] = useState(createPreviewStore);
  const [notice, setNotice] = useState("");
  return (
    <div className="theme-slate dark">
      <div className={styles.banner}>
        <div>
          <strong>Local design preview</strong>
          <span>Sample data · edits stay in this tab · refresh to reset</span>
          {notice && <small role="status">{notice}</small>}
        </div>
        <AccountMenuView
          user={{ name: "Preview User", email: "preview@example.com" }}
          // Full navigation keeps the unsaved-edit warning.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          dashboardSettings={<a href="/preview/settings">Dashboard settings</a>}
          onSignOut={() => setNotice("This is a sample account. No live session is connected.")}
        />
      </div>
      <SettingsEditor request={request} preview />
    </div>
  );
}
