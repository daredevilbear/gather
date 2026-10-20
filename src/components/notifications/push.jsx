import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./inbox.module.css";

function remember(context, enabled) {
  try {
    if (context.intentKey) localStorage.setItem(context.intentKey, enabled ? "enabled" : "disabled");
  } catch {
    /* Push still works when browser storage is unavailable. */
  }
}

function intent(context) {
  try {
    return context.intentKey ? localStorage.getItem(context.intentKey) : null;
  } catch {
    return null;
  }
}

function subscriptionBody(subscription, context) {
  return { ...subscription.toJSON(), ...(context.account ? { account: context.account } : {}) };
}

function subscriptionOptions(publicKey) {
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (publicKey.length % 4)) % 4));
  return { userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) };
}

export default function PushControls({ api, prefix }) {
  const [ready, setReady] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [needsReset, setNeedsReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("Checking push support…");
  const operation = useRef(false);
  const synchronize = useCallback(
    async (context) => {
      let subscription = await context.registration.pushManager.getSubscription();
      let active = Boolean(subscription && (await api("status", subscriptionBody(subscription, context))).enabled);
      let recoveryError = false;
      const saved = intent(context);
      if (active && saved !== "disabled") remember(context, true);
      if (!active && context.recovery && saved === "enabled" && Notification.permission === "granted") {
        try {
          subscription ||= await context.registration.pushManager.subscribe(subscriptionOptions(context.publicKey));
          if (intent(context) !== "disabled") {
            await api("subscribe", subscriptionBody(subscription, context));
            active = true;
          }
          // An explicit disable in another view wins over an in-flight recovery.
          if (intent(context) === "disabled") {
            if (active) await api("unsubscribe", subscriptionBody(subscription, context));
            active = false;
            await subscription.unsubscribe();
          }
        } catch (error) {
          if (error.status === 401 || error.status === 409) throw error;
          recoveryError = true;
        }
      }
      return { subscription, active, recoveryError };
    },
    [api],
  );
  const prepare = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setChecking(true);
    let context = null;
    try {
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
      context = {
        registration,
        publicKey: config.publicKey,
        account: config.account,
        recovery: config.pushRecovery === true,
        intentKey: config.account ? `gather:push:${config.account}:${prefix}` : null,
      };
      const { active, recoveryError } = await synchronize(context);
      setReady(context);
      setNeedsReset(false);
      setEnabled(Boolean(active));
      setMessage(
        active
          ? "Push is on for this device, including when the dashboard is closed."
          : recoveryError
            ? "Push could not be restored automatically. Enable notifications to retry."
            : "Receive new notifications on this device, even when the dashboard is closed.",
      );
    } catch (error) {
      if (error.status === 409) {
        setReady(context);
        setEnabled(false);
        setNeedsReset(true);
        setMessage(
          "This browser subscription belongs to a previous sign-in. Reset browser push, then enable it for this account.",
        );
      } else {
        setReady(null);
        setMessage("Push settings unavailable. Refresh to try again.");
      }
    } finally {
      operation.current = false;
      setChecking(false);
    }
  }, [api, prefix, synchronize]);
  useEffect(() => {
    // Browser capability detection and subscription registration run after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    prepare();
    window.addEventListener("focus", prepare);
    const resume = () => {
      if (document.visibilityState === "visible") prepare();
    };
    window.addEventListener("pageshow", prepare);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("focus", prepare);
      window.removeEventListener("pageshow", prepare);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [prepare]);
  async function toggle() {
    if (!ready || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      // Request permission before any other await to preserve iPhone's user gesture.
      if (!enabled && Notification.permission !== "granted" && (await Notification.requestPermission()) !== "granted")
        throw Error("Allow notifications in your device settings.");
      let subscription = await ready.registration.pushManager.getSubscription();
      if (enabled) {
        remember(ready, false);
        if (subscription) {
          await api("unsubscribe", subscriptionBody(subscription, ready));
          await subscription.unsubscribe();
        }
        setEnabled(false);
        setMessage("Push is off on this device.");
      } else {
        subscription =
          subscription || (await ready.registration.pushManager.subscribe(subscriptionOptions(ready.publicKey)));
        await api("subscribe", subscriptionBody(subscription, ready));
        remember(ready, true);
        setEnabled(true);
        setMessage("Push is enabled. Send a test to check delivery.");
      }
    } catch (error) {
      setMessage(error.message || "Could not change push settings.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function resetBrowserPush() {
    if (!ready || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      remember(ready, false);
      const subscription = await ready.registration.pushManager.getSubscription();
      if (subscription && !(await subscription.unsubscribe())) throw Error();
      setEnabled(false);
      setNeedsReset(false);
      setMessage("Browser push reset. Enable notifications for this account.");
    } catch {
      setMessage("Could not reset browser push. Check the notification permission in your browser settings.");
    } finally {
      operation.current = false;
      setBusy(false);
    }
  }
  async function test() {
    if (!ready || operation.current) return;
    operation.current = true;
    setBusy(true);
    try {
      const { subscription, active } = await synchronize(ready);
      if (!active) {
        setEnabled(false);
        setMessage("Push is no longer enabled on this device. Enable notifications again before testing.");
        return;
      }
      await api("test", subscriptionBody(subscription, ready));
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
      operation.current = false;
      setBusy(false);
    }
  }
  return (
    <section aria-label="Push notifications">
      <div className={styles.actions}>
        {needsReset && (
          <button type="button" disabled={busy || checking || !ready} onClick={resetBrowserPush}>
            Reset browser push
          </button>
        )}
        <button type="button" disabled={busy || checking || !ready || needsReset} onClick={toggle}>
          {checking
            ? "Checking push status…"
            : !ready
              ? "Push settings unavailable"
              : enabled
                ? "Disable push on this device"
                : "Enable push notifications"}
        </button>
        {enabled && (
          <button type="button" disabled={busy || checking || !ready} onClick={test}>
            Send test notification
          </button>
        )}
      </div>
      <small role="status">{message}</small>
    </section>
  );
}
