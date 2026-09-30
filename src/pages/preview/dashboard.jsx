import * as yaml from "js-yaml";
import { useState } from "react";

import DashboardWorkspace from "components/account/dashboard-workspace";
import { createPreviewStore } from "components/settings/preview-store";
import styles from "components/settings/preview.module.css";
export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
export default function DashboardPreview() {
  const [request] = useState(() => {
    const store = createPreviewStore();
    let current = "shared",
      share = null;
    const ready = (async () => {
      const doc = await store(null, "settings.yaml");
      const value = yaml.load(doc.text);
      value.title = "My dashboard";
      value.gather = { tabs: ["Home", "Media", "Network"] };
      await store({ action: "save", file: "settings.yaml", text: yaml.dump(value), revision: doc.revision });
    })();
    return async (body, file) => {
      await ready;
      if (file === "shared-services")
        return {
          services: [
            { group: "Your everyday", name: "Home Assistant" },
            { group: "Watch and unwind", name: "Plex" },
          ],
        };
      if (file || body?.file) return store(body, file);
      if (body?.action === "current") current = body.target;
      if (body?.action === "sharing") share = body.enabled ? "a".repeat(48) : null;
      return { current, share, canEdit: true };
    };
  });
  return (
    <>
      <div className={styles.banner}>Personal dashboard preview · sample data · changes stay in this tab</div>
      <DashboardWorkspace identity="workspace-preview" status="authenticated" request={request} preview />
    </>
  );
}
