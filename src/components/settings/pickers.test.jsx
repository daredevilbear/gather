// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPreviewContext, IconPicker, IntegrationPicker, TokenList } from "./pickers";

afterEach(() => vi.unstubAllGlobals());
describe("guided settings pickers", () => {
  it("replaces a widget only after confirmation and removes old credentials", () => {
    const change = vi.fn();
    render(
      <IntegrationPicker
        value={{
          type: "homeassistant",
          url: "https://old.test",
          key: "old-secret",
          custom: [{ state: "sensor.private" }],
        }}
        onChange={change}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change widget" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search widgets" }), { target: { value: "mealie" } });
    fireEvent.click(screen.getByRole("button", { name: /Mealie\s*Connect/ }));
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Replace widget" }));
    expect(change).toHaveBeenCalledWith({ type: "mealie" });
  });
  it("preserves custom widget options and secret placeholders when editing a connection", () => {
    const change = vi.fn();
    const value = {
      type: "homeassistant",
      url: "https://old.test",
      key: "{{HOMEPAGE_VAR_TOKEN}}",
      custom: [{ state: "sensor.power" }],
    };
    render(<IntegrationPicker value={value} onChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), { target: { value: "https://new.test" } });
    expect(change).toHaveBeenCalledWith({ ...value, url: "https://new.test" });
    expect(screen.queryByText("Add property")).not.toBeInTheDocument();
  });
  it("selects icons without writing configuration or contacting live APIs in preview", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const change = vi.fn();
    render(
      <EditorPreviewContext.Provider value>
        <IconPicker onChange={change} />
      </EditorPreviewContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose icon" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "plex" } });
    fireEvent.click(screen.getByRole("button", { name: "Plex" }));
    expect(change).toHaveBeenCalledWith("plex.png");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects an unsupported upload and keeps an existing icon", async () => {
    const change = vi.fn();
    render(
      <EditorPreviewContext.Provider value>
        <IconPicker value="plex.png" onChange={change} />
      </EditorPreviewContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose icon" }));
    fireEvent.change(screen.getByLabelText(/Upload an icon/), {
      target: { files: [new File(["<svg/>"], "unsafe.svg", { type: "image/svg+xml" })] },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("PNG, JPEG or WebP");
    expect(change).not.toHaveBeenCalled();
  });
  it("keeps uploaded preview images in the browser", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const change = vi.fn();
    render(
      <EditorPreviewContext.Provider value>
        <IconPicker onChange={change} />
      </EditorPreviewContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Choose icon" }));
    fireEvent.change(screen.getByLabelText(/Upload an icon/), {
      target: { files: [new File(["fixture"], "test.png", { type: "image/png" })] },
    });
    await waitFor(() => expect(change).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)));
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("prevents invalid and duplicate topics", () => {
    function Example() {
      const [values, setValues] = useState(["home"]);
      return <TokenList title="Topics" pattern="^[A-Za-z0-9_-]+$" values={values} onChange={setValues} />;
    }
    render(<Example />);
    fireEvent.change(screen.getByRole("textbox", { name: "Topics" }), { target: { value: "home" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Topics" }), { target: { value: "bad topic" } });
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: "Topics" }), { target: { value: "services" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByRole("button", { name: "Remove services" })).toBeInTheDocument();
  });
});
