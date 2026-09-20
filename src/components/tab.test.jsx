// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TabContext } from "utils/contexts/tab";

import Tab, { initialTabFromPath, slugifyAndEncode } from "./tab";

describe("components/tab", () => {
  it("slugifyAndEncode lowercases and encodes spaces", () => {
    expect(slugifyAndEncode("My Tab")).toBe("my-tab");
    expect(slugifyAndEncode(undefined)).toBe("");
  });

  it("marks the matching tab as selected and updates hash on click", () => {
    const setActiveTab = vi.fn();

    render(
      <TabContext.Provider value={{ activeTab: "my-tab", setActiveTab }}>
        <Tab tab="My Tab" />
      </TabContext.Provider>,
    );

    const btn = screen.getByRole("tab");
    expect(btn.getAttribute("aria-selected")).toBe("true");

    fireEvent.click(btn);
    expect(setActiveTab).toHaveBeenCalledWith("my-tab");
    expect(window.location.hash).toBe("#my-tab");
  });
});

describe("initial dashboard tab", () => {
  const tabs = ["Home", "Media Library"];
  it("keeps notification query parameters out of the selected tab", () => {
    expect(initialTabFromPath("/?notifications=open&notification=message123", tabs)).toBe("home");
  });
  it("preserves a valid tab fragment alongside notification parameters", () => {
    expect(initialTabFromPath("/?notifications=open#media-library", tabs)).toBe("media-library");
  });
  it("falls back for missing or stale fragments", () => {
    expect(initialTabFromPath("/", tabs)).toBe("home");
    expect(initialTabFromPath("/#deleted-tab", tabs)).toBe("home");
    expect(initialTabFromPath("/", [])).toBe("");
  });
});
