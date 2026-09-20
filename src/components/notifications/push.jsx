import { useCallback, useEffect, useState } from "react";

export default function PushControls({ api, prefix }) {
  const [ready, setReady] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Checking push support…");
  const prepare = useCallback(async () => {
    const ios =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (ios && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches) {
      setMessage("On iPhone, add this dashboard to your Home Screen, open it there, then enable push.");
      return;
    }
    if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) {
      setMessage("Web Push is not supported in this browser.");
      return;
    }
    try {
      const config = await api("config");
      const registration = await navigator.serviceWorker.register(`${prefix}sw.js`, {
        scope: prefix,
        updateViaCache: "none",
      });
      if (!registration.active) {
        const worker = registration.installing || registration.waiting;
        await new Promise((resolve, reject) => {
          if (!worker) {
            reject(Error("Worker unavailable"));
            return;
          }
          const timer = setTimeout(() => reject(Error("Worker activation timed out")), 15000);
          const changed = () => {
            if (worker.state === "activated") {
              clearTimeout(timer);
              worker.removeEventListener("statechange", changed);
              resolve();
            }
            if (worker.state === "redundant") {
              clearTimeout(timer);
              worker.removeEventListener("statechange", changed);
              reject(Error("Worker unavailable"));
            }
          };
          worker.addEventListener("statechange", changed);
          changed();
        });
      }
      const subscription = await registration.pushManager.getSubscription();
      const active = subscription && (await api("status", subscription.toJSON())).enabled;
      setReady({ registration, publicKey: config.publicKey });
      setEnabled(Boolean(active));
      setMessage(
        active
          ? "Push is on for this device, including when the dashboard is closed."
          : "Receive new notifications on this device, even when the dashboard is closed.",
      );
    } catch {
      setMessage("Push settings unavailable. Refresh to try again.");
    }
  }, [api, prefix]);
  useEffect(() => {
    // Browser capability detection and subscription registration run after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    prepare();
    window.addEventListener("focus", prepare);
    return () => window.removeEventListener("focus", prepare);
  }, [prepare]);
  async function toggle() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      // Request permission before any other await to preserve iPhone's user gesture.
      if (!enabled && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted")
        throw Error("Allow notifications in your device settings.");
      let subscription = await ready.registration.pushManager.getSubscription();
      if (enabled && subscription) {
        await api("unsubscribe", subscription.toJSON());
        await subscription.unsubscribe();
        setEnabled(false);
        setMessage("Push is off on this device.");
      } else {
        const raw = atob(
          ready.publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (ready.publicKey.length % 4)) % 4),
        );
        subscription =
          subscription ||
          (await ready.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
          }));
        await api("subscribe", subscription.toJSON());
        setEnabled(true);
        setMessage("Push is enabled. Send a test to check delivery.");
      }
    } catch (error) {
      setMessage(error.message || "Could not change push settings.");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    try {
      const subscription = await ready.registration.pushManager.getSubscription();
      await api("test", subscription.toJSON());
      setMessage("Test notification queued.");
    } catch {
      setMessage("Could not send test notification.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Push notifications">
      <div>
        <button type="button" disabled={busy || !ready} onClick={toggle}>
          {enabled ? "Disable push on this device" : "Enable push notifications"}
        </button>
        {enabled && (
          <button type="button" disabled={busy} onClick={test}>
            Send test notification
          </button>
        )}
      </div>
      <small role="status">{message}</small>
    </section>
  );
}
