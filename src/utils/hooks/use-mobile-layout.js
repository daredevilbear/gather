import { useSyncExternalStore } from "react";
const query = "(max-width: 639px)";
const subscribe = (callback) => {
  if (!window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
export default function useMobileLayout() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
