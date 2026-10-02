// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorPreviewContext, IconPicker, IntegrationPicker, TokenList, matchesIcon } from "./pickers";

afterEach(() => vi.unstubAllGlobals());
describe("guided settings pickers", () => {
  it("adds NerdAxe from the library with its miner URL", () => {
    const change = vi.fn();
    const { rerender } = render(<IntegrationPicker value={null} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose integration widget" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search widgets" }), { target: { value: "nerdaxe" } });
    fireEvent.click(screen.getByRole("button", { name: /NerdAxe \/ NerdQAxe/ }));
    expect(change).toHaveBeenCalledWith({ type: "nerdaxe" });
    rerender(<IntegrationPicker value={{ type: "nerdaxe" }} onChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), {
      target: { value: "http://192.168.100.11" },
    });
    expect(change).toHaveBeenLastCalledWith({ type: "nerdaxe", url: "http://192.168.100.11" });
  });
  it("offers Bitcoin Node with RPC connection fields", () => {
    const change = vi.fn();
    const { rerender } = render(<IntegrationPicker value={null} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose integration widget" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search widgets" }), { target: { value: "bitcoin" } });
    fireEvent.click(screen.getByRole("button", { name: /Bitcoin Node/ }));
    expect(change).toHaveBeenCalledWith({ type: "bitcoinnode" });
    rerender(<IntegrationPicker value={{ type: "bitcoinnode" }} onChange={change} />);
    expect(screen.getByRole("textbox", { name: "Server URL" })).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
  });

  it("adds Bitaxe from the library and exposes its miner URL", () => {
    const change = vi.fn();
    const { rerender } = render(<IntegrationPicker value={null} onChange={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose integration widget" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search widgets" }), { target: { value: "bitaxe" } });
    fireEvent.click(screen.getByRole("button", { name: /Bitaxe\s*Connect/ }));
    expect(change).toHaveBeenCalledWith({ type: "bitaxe" });
    rerender(<IntegrationPicker value={{ type: "bitaxe" }} onChange={change} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Server URL" }), { target: { value: "http://miner.local" } });
    expect(change).toHaveBeenLastCalledWith({ type: "bitaxe", url: "http://miner.local" });
  });
  it.each(["jellyfin", "nerdaxe", "bitaxe", "bitcoinnode"])("links %s setup help to Gather documentation", (type) => {
    render(<IntegrationPicker value={{ type }} onChange={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Setup guide ↗" })).toHaveAttribute(
      "href",
      `https://gather.daredevilbear.dev/widgets/services/${type}/`,
    );
  });

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
      key: "{{GATHER_VAR_TOKEN}}",
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

it("matches icon names, filenames, tags and punctuation without case sensitivity", () => {
  const icon = { name: "Home Assistant", value: "home-assistant.png", tags: "smart home automation" };
  for (const query of ["HOME", "home-assistant.png", " smart automation ", "home assistant"]) {
    expect(matchesIcon(icon, query)).toBe(true);
  }
  expect(matchesIcon(icon, "media")).toBe(false);
});
it("finds library icons by category tags", () => {
  render(
    <EditorPreviewContext.Provider value>
      <IconPicker onChange={vi.fn()} />
    </EditorPreviewContext.Provider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Choose icon" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Search icons" }), { target: { value: "vpn" } });
  expect(screen.getByRole("button", { name: "Wireguard" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Plex" })).not.toBeInTheDocument();
});

it("focuses icon search and restores the chooser on Escape", () => {
  render(
    <EditorPreviewContext.Provider value>
      <IconPicker onChange={vi.fn()} />
    </EditorPreviewContext.Provider>,
  );
  const trigger = screen.getByRole("button", { name: "Choose icon" });
  fireEvent.click(trigger);
  expect(screen.getByRole("searchbox", { name: "Search icons" })).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search icons" }), { key: "Escape" });
  expect(screen.queryByRole("searchbox", { name: "Search icons" })).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
