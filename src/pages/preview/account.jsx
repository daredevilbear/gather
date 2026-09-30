import { useState } from "react";

import { AccountPreferencesContent } from "../account";

import styles from "components/settings/preview.module.css";

export function getServerSideProps() {
  return process.env.NODE_ENV === "development" ? { props: {} } : { notFound: true };
}
export default function AccountPreview() {
  const [data, setData] = useState({ widgetsPosition: "below" });
  return (
    <>
      <div className={styles.banner}>
        <p role="status">Local preferences preview · changes stay in this tab</p>
      </div>
      <AccountPreferencesContent
        data={data}
        mutate={async (value) => setData(value)}
        request={async (_, options) => ({ ok: true, json: async () => JSON.parse(options.body) })}
      />
    </>
  );
}
