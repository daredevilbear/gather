import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import useCurrentTime from "utils/hooks/use-current-time";

const FreshnessContext = createContext(null);
export const useFreshnessReporter = () => useContext(FreshnessContext);
export function freshnessSummary(records, now) {
  const values = Object.values(records);
  if (!values.length) return { label: "Waiting for refresh", state: "waiting" };
  const successful = values.filter((value) => value.success);
  const oldest = successful.length ? Math.min(...successful.map((value) => value.success)) : null;
  if (values.some((value) => value.error))
    return {
      label: oldest ? "Refresh failed · cached data" : "Refresh failed · no data",
      state: "error",
      time: oldest,
    };
  if (values.some((value) => !value.success)) return { label: "Waiting for refresh", state: "waiting", time: oldest };
  if (now && values.some((value) => now - value.success > Math.max(60000, value.interval * 3)))
    return { label: "Stale data", state: "stale", time: oldest };
  return { label: "Updated", state: "fresh", time: oldest };
}
export default function Freshness({ children }) {
  const [records, setRecords] = useState({});
  const [offline, setOffline] = useState(false);
  const now = useCurrentTime(15000);
  const report = useCallback((key, status, interval = 30000) => {
    setRecords((previous) => {
      if (status === "remove") {
        const next = { ...previous };
        delete next[key];
        return next;
      }
      const prior = previous[key] || {};
      if (status === "pending" && previous[key]) return previous;
      if (status === "error" && prior.error) return previous;
      return {
        ...previous,
        [key]: {
          ...prior,
          interval: typeof interval === "number" ? interval : 30000,
          error: status === "error",
          success: status === "success" ? Date.now() : prior.success,
        },
      };
    });
  }, []);
  useEffect(() => {
    const changed = () => setOffline(navigator.onLine === false);
    changed();
    window.addEventListener("offline", changed);
    window.addEventListener("online", changed);
    return () => {
      window.removeEventListener("offline", changed);
      window.removeEventListener("online", changed);
    };
  }, []);
  const result = useMemo(() => freshnessSummary(records, now), [records, now]);
  const age = result.time && now ? Math.max(0, Math.floor((now - result.time) / 1000)) : null;
  return (
    <FreshnessContext.Provider value={report}>
      {children}
      <span
        className={`widget-refresh-status block px-2 pb-1 text-[10px] ${offline || ["error", "stale"].includes(result.state) ? "text-amber-600 dark:text-amber-300" : "opacity-60"}`}
        title={
          result.time
            ? `Last successful refresh: ${new Date(result.time).toLocaleString()}`
            : "No successful refresh recorded in this session"
        }
      >
        {offline ? "Offline · " : ""}
        {result.label}
        {age !== null ? ` ${age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} ago` : ""}
      </span>
    </FreshnessContext.Provider>
  );
}
