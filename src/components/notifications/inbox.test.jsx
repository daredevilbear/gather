// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Inbox from "./inbox";
import Message from "./message";

const { session } = vi.hoisted(() => ({
  session: { status: "authenticated", data: { user: { email: "person@example.test" } } },
}));
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("./push", () => ({ default: () => <div>Push controls</div> }));

const messages = [
  { id: "one", title: "First", message: "First body", topic: "test", time: 1 },
  { id: "two", title: "Second", message: "Second body", topic: "test", time: 2 },
];
let states;
function mount(props = {}) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Inbox {...props} />
    </SWRConfig>,
  );
}
beforeEach(() => {
  session.status = "authenticated";
  session.data = { user: { email: "person@example.test" } };
  localStorage.clear();
  history.replaceState({}, "", "/");
  states = { two: "dismissed" };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: new EventTarget() });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      const path = String(url).split("/").at(-1);
      if (options?.method === "POST") Object.assign(states, JSON.parse(options.body).updates);
      return {
        ok: true,
        json: async () =>
          path === "feed"
            ? { messages, checked_at: 1 }
            : path === "inbox-state"
              ? { account: "account-one", states: { ...states } }
              : { message: messages.find((message) => message.id === path) },
      };
    }),
  );
});
describe("native notification inbox", () => {
  it("persists Unread across unmount and remount", async () => {
    const view = mount();
    await screen.findByText("First");
    fireEvent.change(screen.getByLabelText("Filter notifications"), { target: { value: "unread" } });
    expect(localStorage.getItem("gather:filter:person@example.test")).toBe("unread");
    view.unmount();
    mount();
    await waitFor(() => expect(screen.getByLabelText("Filter notifications")).toHaveValue("unread"));
  });
  it("opens a dismissed target from a cold link without resetting Unread", async () => {
    localStorage.setItem("gather:filter:person@example.test", "unread");
    history.replaceState({}, "", "/?notifications=open&notification=two");
    mount();
    const row = (await screen.findByText("Second")).closest("article");
    expect(row).toHaveAttribute("data-selected", "true");
    expect(row.closest("details").open).toBe(true);
    expect(screen.getByLabelText("Filter notifications")).toHaveValue("unread");
  });
  it("opens a warm worker handoff and acknowledges it", async () => {
    mount();
    await screen.findByText("First");
    const reply = vi.fn();
    await act(async () =>
      navigator.serviceWorker.dispatchEvent(
        new MessageEvent("message", {
          origin: location.origin,
          data: { type: "GATHER_OPEN_NOTIFICATION", messageId: "two" },
          ports: [{ postMessage: reply }],
        }),
      ),
    );
    expect((await screen.findByText("Second")).closest("details").open).toBe(true);
    expect(reply).toHaveBeenCalledWith({ opened: true });
  });
  it("saves read status with account and CSRF header", async () => {
    mount();
    await screen.findByText("First");
    fireEvent.click(screen.getByText("Mark read"));
    await waitFor(() => expect(states.one).toBe("read"));
    expect(fetch).toHaveBeenCalledWith(
      "/gather-notifications/inbox-state",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Gather-Push": "1" }),
        body: JSON.stringify({ account: "account-one", updates: { one: "read" } }),
      }),
    );
  });
  it("renders safe links without interpreting notification HTML", () => {
    const { container } = render(
      <Message
        text={
          "See https://example.test/path. [Details](https://example.test/details) <img src=x onerror=alert(1)> javascript:alert(1)"
        }
      />,
    );
    expect(screen.getAllByRole("link").map((link) => link.href)).toEqual([
      "https://example.test/path",
      "https://example.test/details",
    ]);
    expect(container.querySelector("img")).toBeNull();
  });
});

it("updates and clears the installed app badge as unread messages are read", async () => {
  Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: vi.fn().mockResolvedValue() });
  Object.defineProperty(navigator, "clearAppBadge", { configurable: true, value: vi.fn().mockResolvedValue() });
  mount();
  await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(1));
  fireEvent.click(screen.getByText("Mark read"));
  await waitFor(() => expect(navigator.clearAppBadge).toHaveBeenCalled());
});
it("renders a full-page inbox and saves account-specific preferences", async () => {
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <Inbox fullPage />
    </SWRConfig>,
  );
  await screen.findByText("First");
  expect(screen.getByRole("link", { name: "Back to dashboard" })).toHaveAttribute("href", "/");
  fireEvent.click(screen.getByText("Notification preferences"));
  fireEvent.click(screen.getByLabelText("Open push notifications in the full-page inbox"));
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/gather-notifications/inbox-state",
      expect.objectContaining({
        body: JSON.stringify({
          account: "account-one",
          updates: {},
          preferences: { badge: true, pushPage: false, inboxView: "panel" },
        }),
      }),
    ),
  );
});

it("reapplies the badge on app resume even when inbox data is unchanged", async () => {
  Object.defineProperty(navigator, "setAppBadge", { configurable: true, value: vi.fn().mockResolvedValue() });
  mount();
  await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(1));
  navigator.setAppBadge.mockClear();
  fireEvent(window, new Event("pageshow"));
  await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(1));
  navigator.setAppBadge.mockClear();
  fireEvent(document, new Event("visibilitychange"));
  await waitFor(() => expect(navigator.setAppBadge).toHaveBeenCalledWith(1));
});

it("reports unread count while closed and updates after marking read", async () => {
  const onUnreadChange = vi.fn();
  const view = mount({ onUnreadChange });
  await waitFor(() => expect(onUnreadChange).toHaveBeenLastCalledWith(1));
  expect(view.container.querySelector("details").open).toBe(false);
  fireEvent.click(screen.getByText("Mark read"));
  await waitFor(() => expect(onUnreadChange).toHaveBeenLastCalledWith(0));
});
