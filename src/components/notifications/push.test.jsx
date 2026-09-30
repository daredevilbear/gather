// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import PushControls from "./push";

let api;
let getSubscription;

beforeEach(() => {
  getSubscription = vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: "test" }) });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn().mockResolvedValue({ active: true, pushManager: { getSubscription } }),
    },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission: "granted" });
  api = vi.fn(async (path) => (path === "config" ? { publicKey: "key" } : { enabled: true }));
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
  expect(await screen.findByText(/Push is no longer enabled/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Enable push notifications" })).toBeInTheDocument();
  expect(api).not.toHaveBeenCalledWith("test", expect.anything());
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
