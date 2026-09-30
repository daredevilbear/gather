import { useSession } from "next-auth/react";
import useSWR from "swr";

export default function usePreferences() {
  const { data: session, status } = useSession();
  const identity = session?.user?.gatherIdentity || session?.user?.id || session?.user?.email || session?.user?.name;
  return useSWR(status === "authenticated" && identity ? ["gather-preferences", identity] : null, async () => {
    const response = await fetch("/api/gather/preferences", { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) throw Error("Your preferences could not be loaded.");
    return response.json();
  });
}
