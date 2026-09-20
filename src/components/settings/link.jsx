import Link from "next/link";
import useSWR from "swr";
export default function SettingsLink() {
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
    <Link href="/settings" className="flex min-h-11 items-center underline">
      Dashboard settings
    </Link>
  ) : null;
}
