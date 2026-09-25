// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TabContext } from "utils/contexts/tab";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GatherHeader from "./header";
vi.mock("components/account/menu", () => ({
  default: ({ notifications }) => <div>Account controls{notifications}</div>,
}));
vi.mock("components/notifications/inbox", () => ({ default: () => <div>Notification inbox</div> }));
const { preference } = vi.hoisted(() => ({ preference: { widgetsPosition: "below" } }));
vi.mock("components/account/preferences", () => ({ default: () => ({ data: preference }) }));
vi.mock("components/tab", () => ({
  default: ({ tab }) => <li>{tab}</li>,
  slugifyAndEncode: (tab) => encodeURIComponent(tab.toLowerCase().replace(/\s+/g, "-")),
}));
beforeEach(() => {
  preference.widgetsPosition = "below";
});
describe("Gather application navigation", () => {
  it("offers search and account controls independently of information widgets", () => {
    const onSearch = vi.fn();
    render(<GatherHeader onSearch={onSearch} />);
    expect(screen.getByText("Account controls")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Dashboard settings" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Find services & bookmarks" }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(screen.queryByText("Notification inbox")).not.toBeInTheDocument();
  });
  it("honors account opt-out and the configured notification connection", () => {
    render(<GatherHeader settings={{ gather: { accountMenu: false, notifications: true } }} />);
    expect(screen.queryByText("Account controls")).not.toBeInTheDocument();
    expect(screen.queryByText("Notification inbox")).not.toBeInTheDocument();
  });
});

it("places Home widgets before or after tabs according to the account preference", () => {
  const view = render(
    <GatherHeader tabs={["Home"]} informationWidgets={<div data-testid="home-widgets">Weather</div>} />,
  );
  const widgets = () => screen.getByTestId("home-widgets");
  const tabs = () => screen.getByRole("navigation", { name: "Dashboard sections" });
  expect(tabs().compareDocumentPosition(widgets()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  preference.widgetsPosition = "above";
  view.rerender(<GatherHeader tabs={["Home"]} informationWidgets={<div data-testid="home-widgets">Weather</div>} />);
  expect(widgets().compareDocumentPosition(tabs()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("selects a mobile section and keeps the URL in sync", () => {
  const setActiveTab = vi.fn();
  render(
    <TabContext.Provider value={{ activeTab: "home", setActiveTab }}>
      <GatherHeader tabs={["Home", "My Systems"]} />
    </TabContext.Provider>,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Dashboard section" }), { target: { value: "my-systems" } });
  expect(setActiveTab).toHaveBeenCalledWith("my-systems");
  expect(window.location.hash).toBe("#my-systems");
});
it("places notifications inside the account controls", () => {
  render(<GatherHeader settings={{ gather: { notifications: true } }} />);
  expect(screen.getByText("Notification inbox").parentElement).toHaveTextContent("Account controls");
});
