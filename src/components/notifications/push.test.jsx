// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import PushControls from "./push";

let api;
let getSubscription;
let subscribe;

beforeEach(() => {
  localStorage.clear();
  getSubscription = vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: "test" }) });
  subscribe = vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: "replacement" }) });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue({ active: true, pushManager: { getSubscription, subscribe } }),
    },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
  api = vi.fn(async (path) =>
    path === "config" ? { publicKey: "key", account: "account-a", pushRecovery: true } : { enabled: true },
  );
});
afterEach(() => vi.unstubAllGlobals());

async function sendTest() {
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  fireEvent.click(await screen.findByRole("button", { name: "Send test notification" }));
}

it("explains the server cooldown instead of reporting a delivery failure", async () => {
  api.mockImplementation(async (path) => {
    if (path === "test") throw Object.assign(new Error("Notifications unavailable"), { status: 429 });
    return path === "config" ? { publicKey: "key" } : { enabled: true };
  });
  await sendTest();
  expect(await screen.findByText(/Tests are limited to one per minute/)).toBeInTheDocument();
});

it("explains the interval after a test is queued", async () => {
  await sendTest();
  expect(await screen.findByText(/Test notification queued. Wait one minute/)).toBeInTheDocument();
});

it("recovers when the browser subscription disappears before testing", async () => {
  getSubscription.mockResolvedValueOnce({ toJSON: () => ({ endpoint: "test" }) }).mockResolvedValue(null);
  await sendTest();
  expect(await screen.findByText(/Test notification queued/)).toBeInTheDocument();
  expect(subscribe).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith("test", { endpoint: "replacement", account: "account-a" });
});

it("offers a local browser subscription reset after an account conflict", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  getSubscription.mockResolvedValue({ toJSON: () => ({ endpoint: "test" }), unsubscribe });
  api.mockImplementation(async (path) => {
    if (path === "status") throw Object.assign(Error("Conflict"), { status: 409 });
    return { publicKey: "key" };
  });
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  fireEvent.click(await screen.findByRole("button", { name: "Reset browser push" }));
  expect(await screen.findByText(/Browser push reset/)).toBeInTheDocument();
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(api).not.toHaveBeenCalledWith("unsubscribe", expect.anything());
});

it("restores previously enabled push after a reload loses the browser subscription", async () => {
  const first = render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Disable push on this device" });
  first.unmount();
  getSubscription.mockResolvedValue(null);
  api.mockClear();
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Disable push on this device" });
  expect(subscribe).toHaveBeenCalledOnce();
  expect(api).toHaveBeenCalledWith("subscribe", { endpoint: "replacement", account: "account-a" });
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});

async function rememberEnabled() {
  const view = render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Disable push on this device" });
  view.unmount();
}

it("preserves an explicit opt-out across reloads", async () => {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  getSubscription.mockResolvedValue({ toJSON: () => ({ endpoint: "test" }), unsubscribe });
  const view = render(<PushControls api={api} prefix="/gather-notifications/" />);
  fireEvent.click(await screen.findByRole("button", { name: "Disable push on this device" }));
  await screen.findByText("Push is off on this device.");
  view.unmount();
  getSubscription.mockResolvedValue(null);
  api.mockClear();
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Enable push notifications" });
  expect(unsubscribe).toHaveBeenCalledOnce();
  expect(subscribe).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalledWith("subscribe", expect.anything());
});

it.each(["default", "denied"])("does not request permission or recover when permission is %s", async (permission) => {
  await rememberEnabled();
  Notification.permission = permission;
  getSubscription.mockResolvedValue(null);
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Enable push notifications" });
  expect(subscribe).not.toHaveBeenCalled();
  expect(Notification.requestPermission).not.toHaveBeenCalled();
});

it("does not transfer a remembered opt-in to a different account", async () => {
  await rememberEnabled();
  getSubscription.mockResolvedValue(null);
  api.mockImplementation(async (path) =>
    path === "config" ? { publicKey: "key", account: "account-b", pushRecovery: true } : { enabled: true },
  );
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Enable push notifications" });
  expect(subscribe).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalledWith("subscribe", expect.anything());
});

it("does not treat OS permission alone as an account opt-in", async () => {
  getSubscription.mockResolvedValue(null);
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Enable push notifications" });
  expect(subscribe).not.toHaveBeenCalled();
});

it("restores a missing server record for a previously enabled subscription", async () => {
  await rememberEnabled();
  api.mockImplementation(async (path) =>
    path === "config" ? { publicKey: "key", account: "account-a", pushRecovery: true } : { enabled: false },
  );
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Disable push on this device" });
  expect(api).toHaveBeenCalledWith("subscribe", { endpoint: "test", account: "account-a" });
  expect(subscribe).not.toHaveBeenCalled();
});

it("preserves the opt-in through a temporary error and retries on resume", async () => {
  await rememberEnabled();
  getSubscription.mockResolvedValue(null);
  api.mockRejectedValueOnce(new Error("Unavailable"));
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByText("Push settings unavailable. Refresh to try again.");
  expect(screen.getByRole("button", { name: "Push settings unavailable" })).toBeDisabled();
  fireEvent(window, new Event("pageshow"));
  await screen.findByRole("button", { name: "Disable push on this device" });
  expect(subscribe).toHaveBeenCalledOnce();
});

it("keeps controls disabled and serializes checks while status is unknown", async () => {
  let complete;
  api.mockImplementation(async (path) => {
    if (path === "config") return { publicKey: "key", account: "account-a", pushRecovery: true };
    return new Promise((resolve) => {
      complete = resolve;
    });
  });
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await waitFor(() => expect(api).toHaveBeenCalledWith("status", expect.anything()));
  expect(screen.getByRole("button", { name: "Checking push status…" })).toBeDisabled();
  fireEvent.focus(window);
  fireEvent(window, new Event("pageshow"));
  expect(navigator.serviceWorker.register).toHaveBeenCalledOnce();
  complete({ enabled: true });
  await screen.findByRole("button", { name: "Disable push on this device" });
});

it("does not restore a subscription bound to a different sign-in", async () => {
  await rememberEnabled();
  api.mockImplementation(async (path) => {
    if (path === "config") return { publicKey: "key", account: "account-a", pushRecovery: true };
    throw Object.assign(new Error("Conflict"), { status: 409 });
  });
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Reset browser push" });
  expect(subscribe).not.toHaveBeenCalled();
  expect(api).not.toHaveBeenCalledWith("subscribe", expect.anything());
});

it("waits for a companion that supports account-bound recovery", async () => {
  await rememberEnabled();
  getSubscription.mockResolvedValue(null);
  api.mockImplementation(async (path) =>
    path === "config" ? { publicKey: "key", account: "account-a" } : { enabled: false },
  );
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByRole("button", { name: "Enable push notifications" });
  expect(subscribe).not.toHaveBeenCalled();
});

it("allows explicit enable when browser storage is unavailable", async () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw new Error("Storage blocked");
    },
    setItem: () => {
      throw new Error("Storage blocked");
    },
  });
  getSubscription.mockResolvedValue(null);
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  fireEvent.click(await screen.findByRole("button", { name: "Enable push notifications" }));
  await screen.findByRole("button", { name: "Disable push on this device" });
  expect(subscribe).toHaveBeenCalledOnce();
});

it("lets an explicit opt-out win over recovery in another view", async () => {
  const first = render(<PushControls api={api} prefix="/gather-notifications/" />);
  const disable = await screen.findByRole("button", { name: "Disable push on this device" });
  getSubscription.mockResolvedValue(null);
  let complete;
  const unsubscribe = vi.fn().mockResolvedValue(true);
  subscribe.mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
  fireEvent.click(disable);
  await screen.findByText("Push is off on this device.");
  complete({ toJSON: () => ({ endpoint: "replacement" }), unsubscribe });
  await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
  expect(api).not.toHaveBeenCalledWith("subscribe", expect.anything());
  first.unmount();
  await screen.findByRole("button", { name: "Enable push notifications" });
});

it("keeps manual enable available if the browser rejects automatic recovery", async () => {
  await rememberEnabled();
  getSubscription.mockResolvedValue(null);
  subscribe.mockRejectedValueOnce(new DOMException("User gesture required", "NotAllowedError"));
  render(<PushControls api={api} prefix="/gather-notifications/" />);
  await screen.findByText("Push could not be restored automatically. Enable notifications to retry.");
  const enable = screen.getByRole("button", { name: "Enable push notifications" });
  expect(enable).toBeEnabled();
  fireEvent.click(enable);
  await screen.findByRole("button", { name: "Disable push on this device" });
  expect(subscribe).toHaveBeenCalledTimes(2);
});
