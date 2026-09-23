// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsEditor, { Groups } from "./editor";
import { createPreviewStore } from "./preview-store";
vi.mock("next/head", () => ({ default: ({ children }) => children }));
vi.mock("next/link", () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe("settings editor", () => {
  it("loads the visual form and saves changes with the loaded revision", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          file: "settings.yaml",
          text: "title: Original\ngather:\n  notifications: true\n",
          revision: "old",
          backups: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          file: "settings.yaml",
          text: "title: New title\ngather:\n  notifications: true\n",
          revision: "new",
          backups: [],
          applied: true,
        }),
      });
    vi.stubGlobal("fetch", fetcher);
    render(<SettingsEditor />);
    fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    const request = fetcher.mock.calls[1][1];
    const body = JSON.parse(request.body);
    expect(body.revision).toBe("old");
    expect(body.text).toContain("New title");
    expect(request.headers["X-Gather-Editor"]).toBe("1");
  });
  it("keeps unsaved edits when another section is requested", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ file: "settings.yaml", text: "title: Original\n", revision: "old", backups: [] }),
      }),
    );
    render(<SettingsEditor />);
    fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Dashboard title")).toHaveValue("Unsaved");
  });
  it("preserves the shared dashboard draft across appearance and layout", async () => {
    const request = createPreviewStore();
    render(<SettingsEditor request={request} preview />);
    fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "My workspace" } });
    fireEvent.click(screen.getByRole("button", { name: "Layout", exact: true }));
    expect(screen.queryByText(/You have unsaved changes/)).not.toBeInTheDocument();
    fireEvent.change(screen.getAllByLabelText("Tab", { exact: true })[0], { target: { value: "Media" } });
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByLabelText("Dashboard title")).toHaveValue("My workspace");
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    const saved = await request(null, "settings.yaml");
    expect(saved.text).toContain("My workspace");
    expect(saved.text).toContain("Media");
  });
  it("shows a permission error without rendering configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Administrator required" }) }),
    );
    render(<SettingsEditor />);
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Dashboard title")).not.toBeInTheDocument();
  });
  it("does not discard integration fields while renaming a service", () => {
    const change = vi.fn();
    render(
      <Groups
        value={[
          {
            Home: [
              {
                Example: { href: "https://example.test", widget: { type: "customapi", key: "{{HOMEPAGE_VAR_TOKEN}}" } },
              },
            ],
          },
        ]}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByText("Example"));
    fireEvent.change(screen.getByLabelText("Service name"), { target: { value: "Renamed" } });
    expect(change.mock.calls[0][0][0].Home[0].Renamed.widget.key).toBe("{{HOMEPAGE_VAR_TOKEN}}");
  });
});

describe("guided editor navigation", () => {
  it("only includes system navigation when the server grants access", async () => {
    const store = createPreviewStore();
    const request = async (...args) => ({ ...(await store(...args)), capabilities: { system: false } });
    render(<SettingsEditor request={request} />);
    await screen.findByLabelText("Dashboard title");
    expect(screen.queryByRole("button", { name: "System settings" })).not.toBeInTheDocument();
  });
  it("guards unsaved system changes and keeps system settings on the same page", async () => {
    render(<SettingsEditor request={createPreviewStore()} preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "System settings" }));
    fireEvent.change(await screen.findByLabelText("Sign-in button name"), { target: { value: "My account" } });
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    expect(screen.getByText(/You have unsaved changes/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Sign-in button name")).toHaveValue("My account");
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    await screen.findByRole("heading", { name: "Services" });
  });
  it("removes a layout without removing its service group", async () => {
    const request = createPreviewStore();
    const before = await request(null, "services.yaml");
    render(<SettingsEditor request={request} preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "Layout", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Remove layout for Your everyday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    expect((await request(null, "settings.yaml")).text).not.toContain("  Your everyday:");
    expect((await request(null, "services.yaml")).text).toBe(before.text);
  });
  it("blocks saving an invalid service URL in the visual form", async () => {
    const request = vi.fn(createPreviewStore());
    render(<SettingsEditor request={request} preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    fireEvent.click(await screen.findByLabelText("Edit Home Assistant"));
    fireEvent.change(screen.getAllByLabelText("Service URL")[0], { target: { value: "broken url" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    expect(request.mock.calls.filter(([body]) => body?.action === "save")).toHaveLength(0);
  });
});

describe("reset changes", () => {
  it("immediately restores the latest saved version without a hidden confirmation or server write", async () => {
    const request = vi.fn(createPreviewStore());
    render(<SettingsEditor request={request} preview />);
    fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "Saved title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    fireEvent.change(screen.getByLabelText("Dashboard title"), { target: { value: "Unsaved title" } });
    request.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    expect(screen.getByLabelText("Dashboard title")).toHaveValue("Saved title");
    expect(screen.getByRole("status")).toHaveTextContent("reset to the last saved version");
    expect(screen.queryByRole("button", { name: "Discard changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & apply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reset changes" })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });
  it("repairs invalid source and restores shared appearance/layout drafts together", async () => {
    render(<SettingsEditor request={createPreviewStore()} preview />);
    fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "Unsaved title" } });
    fireEvent.click(screen.getByRole("button", { name: "Layout", exact: true }));
    fireEvent.change(screen.getAllByLabelText("Tab", { exact: true })[0], { target: { value: "Media" } });
    fireEvent.click(screen.getByRole("button", { name: "Source", exact: true }));
    fireEvent.change(screen.getByLabelText("settings.yaml"), { target: { value: "broken: [" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Visual", exact: true }));
    expect(screen.getAllByLabelText("Tab", { exact: true })[0]).toHaveValue("Home");
    fireEvent.click(screen.getByRole("button", { name: "Appearance" }));
    expect(screen.getByLabelText("Dashboard title")).toHaveValue("Gather");
  });
});

it("updates the appearance sample from unsaved title, icon, theme and layout values", async () => {
  render(<SettingsEditor request={createPreviewStore()} preview />);
  fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "My preview" } });
  fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "light" } });
  const sample = screen.getByRole("region", { name: "Appearance preview" });
  expect(within(sample).getByText("My preview")).toBeInTheDocument();
  expect(sample).toHaveAttribute("data-theme", "light");
  expect(within(sample).getByText("Your everyday")).toBeInTheDocument();
});

it("renames tabs and updates layout dropdowns without losing the shared draft", async () => {
  render(<SettingsEditor request={createPreviewStore()} preview />);
  await screen.findByLabelText("Dashboard title");
  fireEvent.click(screen.getByRole("button", { name: "Tabs", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Rename Home" }));
  fireEvent.change(screen.getByLabelText("New tab name"), { target: { value: "Everyday" } });
  fireEvent.click(screen.getByRole("button", { name: "Save tab name" }));
  fireEvent.click(screen.getByRole("button", { name: "Layout", exact: true }));
  expect(screen.getAllByLabelText("Tab", { exact: true })[0]).toHaveValue("Everyday");
  expect(screen.getAllByLabelText("Tab", { exact: true })[0].tagName).toBe("SELECT");
});

it("offers all file backups from a dedicated section and restores a saved version", async () => {
  render(<SettingsEditor request={createPreviewStore()} preview />);
  fireEvent.change(await screen.findByLabelText("Dashboard title"), { target: { value: "New title" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
  await screen.findByText(/Saved and applied/);
  fireEvent.click(screen.getByRole("button", { name: "Backup & restore", exact: true }));
  const files = await screen.findByLabelText("Configuration to restore");
  expect(files).toHaveValue("settings.yaml");
  const selector = screen.getByLabelText("Backup to restore");
  fireEvent.change(selector, { target: { value: selector.options[1].value } });
  fireEvent.click(screen.getByRole("button", { name: "Restore selected backup" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
  await screen.findByText(/Saved and applied/);
  fireEvent.click(screen.getByRole("button", { name: "Appearance", exact: true }));
  expect(screen.getByLabelText("Dashboard title")).toHaveValue("Gather");
});

it("groups services by tab while moving the original service index", () => {
  const onChange = vi.fn();
  render(
    <Groups
      value={[{ Media: [{ Plex: { href: "https://media.test" } }] }, { Home: [] }]}
      onChange={onChange}
      layout={{ Media: { tab: "Watch" }, Home: { tab: "Everyday" } }}
      tabs={["Everyday", "Watch"]}
    />,
  );
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Everyday", "Watch"]);
  fireEvent.click(screen.getByRole("button", { name: "Edit group Home" }));
  fireEvent.click(screen.getByRole("button", { name: "Move Home up" }));
  expect(onChange.mock.calls[0][0][0]).toEqual({ Home: [] });
  expect(onChange.mock.calls[0][0][1]).toEqual({ Media: [{ Plex: { href: "https://media.test" } }] });
});

it("opens the native user, variables and migration screens from navigation", async () => {
  render(<SettingsEditor request={createPreviewStore()} preview />);
  await screen.findByLabelText("Dashboard title");
  fireEvent.click(screen.getByRole("button", { name: "Users & access", exact: true }));
  expect(await screen.findByText("Protected server administrator.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Secrets & variables", exact: true }));
  expect(await screen.findByLabelText("Secret value")).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Import from Homepage", exact: true }));
  expect(await screen.findByLabelText("Homepage configuration file")).toHaveAttribute("type", "file");
});

it("shows compact service metadata and lets groups collapse without losing entries", () => {
  render(
    <Groups
      value={[
        {
          Home: [
            {
              Example: { href: "https://example.test", icon: "home-assistant.png", widget: { type: "homeassistant" } },
            },
          ],
        },
      ]}
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByText("1 service across 1 group")).toBeInTheDocument();
  expect(screen.getByText("https://example.test")).toBeInTheDocument();
  expect(screen.getByText("widget")).toBeInTheDocument();
  expect(screen.getByLabelText("Edit Example").parentElement).not.toHaveAttribute("open");
  fireEvent.click(screen.getByRole("button", { name: "Collapse group Home" }));
  expect(screen.queryByLabelText("Edit Example")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Expand group Home" }));
  expect(screen.getByText("https://example.test")).toBeInTheDocument();
});

function dragItem(handle, target) {
  vi.stubGlobal("PointerEvent", MouseEvent);
  const original = document.elementFromPoint;
  document.elementFromPoint = () => target;
  fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
  fireEvent.pointerMove(handle, { clientX: 20, clientY: 30 });
  fireEvent.pointerUp(handle, { clientX: 20, clientY: 30 });
  document.elementFromPoint = original;
}

it("drags services without losing widget secrets and keeps bookmark link arrays", () => {
  const change = vi.fn();
  const first = { First: { href: "https://first.test", widget: { type: "customapi", key: "{{TOKEN}}" } } };
  const second = { Second: { href: "https://second.test" } };
  const { rerender } = render(<Groups value={[{ Home: [first, second] }]} onChange={change} />);
  dragItem(screen.getByRole("button", { name: "Reorder First" }), screen.getByLabelText("Edit Second"));
  expect(change).toHaveBeenLastCalledWith([{ Home: [second, first] }]);
  const bookmark = { First: [{ href: "https://first.test", abbr: "F" }] };
  rerender(<Groups value={[{ Home: [bookmark, second] }]} onChange={change} bookmarks />);
  dragItem(screen.getByRole("button", { name: "Reorder First" }), screen.getByLabelText("Edit Second"));
  expect(change).toHaveBeenLastCalledWith([{ Home: [second, bookmark] }]);
});

it("reorders groups only inside their tab without moving another tab's configuration", () => {
  const change = vi.fn();
  render(
    <Groups
      value={[{ First: [] }, { Other: [] }, { Last: [] }]}
      onChange={change}
      layout={{ First: { tab: "Home" }, Last: { tab: "Home" }, Other: { tab: "Media" } }}
      tabs={["Home", "Media"]}
    />,
  );
  dragItem(screen.getByRole("button", { name: "Reorder group First" }), screen.getByRole("region", { name: "Other" }));
  expect(change).not.toHaveBeenCalled();
  dragItem(screen.getByRole("button", { name: "Reorder group First" }), screen.getByRole("region", { name: "Last" }));
  expect(change).toHaveBeenLastCalledWith([{ Last: [] }, { Other: [] }, { First: [] }]);
});

it("saves dragged Home widget order and resets subsequent keyboard moves", async () => {
  const request = createPreviewStore();
  render(<SettingsEditor request={request} preview />);
  await screen.findByLabelText("Dashboard title");
  fireEvent.click(screen.getByRole("button", { name: "Home widgets", exact: true }));
  const handle = await screen.findByRole("button", { name: "Reorder Greeting" });
  dragItem(handle, screen.getByLabelText("Edit Search"));
  expect(screen.getAllByRole("button", { name: /^Reorder / }).map((e) => e.getAttribute("aria-label"))).toEqual([
    "Reorder Date & time",
    "Reorder Search",
    "Reorder Greeting",
  ]);
  fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
  await screen.findByText(/Saved and applied/);
  const saved = (await request(null, "widgets.yaml")).text;
  expect(saved.indexOf("search:")).toBeLessThan(saved.indexOf("greeting:"));
  fireEvent.keyDown(screen.getByRole("button", { name: "Reorder Greeting" }), { key: "ArrowUp", altKey: true });
  fireEvent.click(screen.getByRole("button", { name: "Reset changes" }));
  expect(screen.getAllByRole("button", { name: /^Reorder / }).map((e) => e.getAttribute("aria-label"))).toEqual([
    "Reorder Date & time",
    "Reorder Search",
    "Reorder Greeting",
  ]);
});

it("renames the visible group from Layout while preserving service and tab references", async () => {
  const request = createPreviewStore();
  const services = await request(null, "services.yaml");
  render(<SettingsEditor request={request} preview />);
  await screen.findByLabelText("Dashboard title");
  fireEvent.click(screen.getByRole("button", { name: "Layout", exact: true }));
  fireEvent.change(await screen.findByLabelText("Group name for Your everyday"), { target: { value: "My home" } });
  fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
  await screen.findByText(/Saved and applied/);
  expect((await request(null, "services.yaml")).text).toBe(services.text);
  fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
  expect(await screen.findByText("My home")).toBeInTheDocument();
});

it("uses only the bookmark origin for its favicon and preserves the rest of its settings", () => {
  const change = vi.fn();
  render(
    <Groups
      bookmarks
      value={[{ Links: [{ Docs: [{ href: "https://docs.example.test/private?token=example", abbr: "D" }] }] }]}
      onChange={change}
    />,
  );
  fireEvent.click(screen.getByLabelText("Edit Docs"));
  fireEvent.click(screen.getByRole("button", { name: "Use website favicon" }));
  expect(change.mock.calls[0][0][0].Links[0].Docs[0]).toEqual({
    href: "https://docs.example.test/private?token=example",
    abbr: "D",
    icon: "https://docs.example.test/favicon.ico",
  });
});
