// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GatherHeader from "./header";
vi.mock("components/account/menu", () => ({ default: () => <div>Account controls</div> }));
vi.mock("components/notifications/inbox", () => ({ default: () => <div>Notification inbox</div> }));
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
