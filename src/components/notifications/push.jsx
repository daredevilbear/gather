import { useCallback, useEffect, useState } from "react";

export default function PushControls({ api, prefix }) {
  const [ready, setReady] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [needsReset, setNeedsReset] = useState(false);
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
      setReady({ registration, publicKey: config.publicKey });
      const active = subscription && (await api("status", subscription.toJSON())).enabled;
      setNeedsReset(false);
      setEnabled(Boolean(active));
      setMessage(
        active
          ? "Push is on for this device, including when the dashboard is closed."
          : "Receive new notifications on this device, even when the dashboard is closed.",
      );
    } catch (error) {
      if (error.status === 409) {
        setEnabled(false);
        setNeedsReset(true);
        setMessage(
          "This browser subscription belongs to a previous sign-in. Reset browser push, then enable it for this account.",
        );
      } else setMessage("Push settings unavailable. Refresh to try again.");
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
  async function resetBrowserPush() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const subscription = await ready.registration.pushManager.getSubscription();
      if (subscription && !(await subscription.unsubscribe())) throw Error();
      setEnabled(false);
      setNeedsReset(false);
      setMessage("Browser push reset. Enable notifications for this account.");
    } catch {
      setMessage("Could not reset browser push. Check the notification permission in your browser settings.");
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const subscription = await ready.registration.pushManager.getSubscription();
      if (!subscription) {
        setEnabled(false);
        setMessage("Push is no longer enabled on this device. Enable notifications again before testing.");
        return;
      }
      await api("test", subscription.toJSON());
      setMessage("Test notification queued. Wait one minute before sending another test.");
    } catch (error) {
      if (error.status === 429) {
        setMessage("Tests are limited to one per minute. Wait one minute after your last test, then try again.");
      } else if (error.status === 404) {
        setEnabled(false);
        setMessage("Push is no longer enabled on this device. Enable notifications again before testing.");
      } else if (error.status === 401) {
        setMessage("Your session has expired. Sign in again before sending a test.");
      } else {
        setMessage("Could not send test notification. Try again shortly.");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Push notifications">
      <div>
        {needsReset && (
          <button type="button" disabled={busy || !ready} onClick={resetBrowserPush}>
            Reset browser push
          </button>
        )}
        <button type="button" disabled={busy || !ready || needsReset} onClick={toggle}>
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
