import { useState } from "react";

import PersonalLayout from "components/account/personal-layout";
import styles from "components/settings/preview.module.css";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
export default function DashboardPreview() {
  const [request] = useState(() => {
    let state = { canEdit: true, revision: 1, dashboard: { title: "My dashboard", links: [] } };
    const catalog = {
      tabs: ["Home", "Media"],
      groups: [
        {
          name: "Your everyday",
          label: "Your everyday",
          kind: "services",
          tab: "Home",
          columns: 3,
          items: ["Home Assistant", "Mealie", "Nextcloud"],
        },
        {
          name: "Watch and unwind",
          label: "Watch and unwind",
          kind: "services",
          tab: "Media",
          columns: 3,
          items: ["Plex", "Seerr"],
        },
        {
          name: "Favorites",
          label: "Favorites",
          kind: "bookmarks",
          tab: "Home",
          columns: 3,
          items: ["Documentation", "News"],
        },
      ],
      widgets: [
        { key: "datetime:0", label: "datetime" },
        { key: "search:1", label: "search" },
      ],
    };
    return async (path, body) => {
      if (path.endsWith("layout-catalog")) return structuredClone(catalog);
      if (body) {
        if (body.revision !== state.revision) throw Error("This dashboard changed. Reload before saving.");
        state = { ...state, dashboard: structuredClone(body.dashboard), revision: state.revision + 1 };
      }
      return structuredClone(state);
    };
  });
  return (
    <>
      <div className={styles.banner}>Local personal-layout preview · sample data · changes stay in this tab</div>
      <PersonalLayout identity="layout-preview" status="authenticated" request={request} />
    </>
  );
}
