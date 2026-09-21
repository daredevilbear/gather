import Head from "next/head";

import Inbox from "components/notifications/inbox";

export default function NotificationsPage() {
  return <main>
    <Head><title>Notifications · Gather</title></Head>
    <h1 className="sr-only">Notification inbox</h1>
    <Inbox fullPage />
  </main>;
}
