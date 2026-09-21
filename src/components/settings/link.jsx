import Link from "next/link";
import useSWR from "swr";

import GatherIcon from "components/gather/icon";
export default function SettingsLink({ className = "flex min-h-11 items-center gap-2" }) {
  const { data } = useSWR(
    "/api/gather/settings",
    async (url) => {
      try {
        const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        return response.ok ? response.json() : {};
      } catch {
        return {};
      }
    },
    { revalidateOnFocus: true, shouldRetryOnError: false },
  );
  return data?.administrator ? (
    <Link href="/settings" className={className}>
      <GatherIcon name="settings" />
      Dashboard settings
    </Link>
  ) : null;
}
