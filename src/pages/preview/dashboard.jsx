import { useState } from "react";

import { PersonalDashboardContent } from "../dashboard";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
export default function DashboardPreview() {
  const [request] = useState(() => {
    let state = {
      canEdit: true,
      revision: 1,
      dashboard: {
        title: "My space",
        links: [
          {
            name: "Home Assistant",
            url: "https://example.com/home",
            description: "A comfortable home, one tap away.",
            tab: "Home",
          },
          { name: "Media", url: "https://example.com/media", description: "Something good to watch.", tab: "Media" },
        ],
      },
    };
    return async (body) => {
      if (body) {
        if (body.revision !== state.revision) throw Error("This dashboard changed. Reload before saving.");
        state = { ...state, dashboard: structuredClone(body.dashboard), revision: state.revision + 1 };
      }
      return structuredClone(state);
    };
  });
  return (
    <>
      <p role="status">Local personal-dashboard preview · sample links · changes stay in this tab</p>
      <PersonalDashboardContent identity="preview" status="authenticated" request={request} />
    </>
  );
}
