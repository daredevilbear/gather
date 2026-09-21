// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GatherHeader from "./header";
vi.mock("components/account/menu", () => ({ default: () => <div>Account controls</div> }));
vi.mock("components/notifications/inbox", () => ({ default: () => <div>Notification inbox</div> }));
const { preference } = vi.hoisted(() => ({ preference: { widgetsPosition: "below" } }));
vi.mock("components/account/preferences", () => ({ default: () => ({ data: preference }) }));
vi.mock("components/tab", () => ({ default: ({ tab }) => <li>{tab}</li> }));
beforeEach(() => { preference.widgetsPosition = "below"; });
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
    expect(screen.getByText("Notification inbox")).toBeInTheDocument();
  });
});


it("places Home widgets before or after tabs according to the account preference", () => {
  const view = render(<GatherHeader tabs={["Home"]} informationWidgets={<div data-testid="home-widgets">Weather</div>} />);
  const widgets = () => screen.getByTestId("home-widgets");
  const tabs = () => screen.getByRole("navigation", { name: "Dashboard sections" });
  expect(tabs().compareDocumentPosition(widgets()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  preference.widgetsPosition = "above";
  view.rerender(<GatherHeader tabs={["Home"]} informationWidgets={<div data-testid="home-widgets">Weather</div>} />);
  expect(widgets().compareDocumentPosition(tabs()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
