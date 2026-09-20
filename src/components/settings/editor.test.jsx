// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SettingsEditor, { Groups } from "./editor";
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
      vi
        .fn()
        .mockResolvedValue({
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
