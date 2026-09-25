// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountMenu, { accountSettingsUrl } from "./menu";
const { signOut, useSession } = vi.hoisted(() => ({ signOut: vi.fn(), useSession: vi.fn() }));
vi.mock("components/settings/link", () => ({ default: () => <span>Dashboard settings</span> }));
vi.mock("next-auth/react", () => ({ signOut, useSession }));
vi.mock("next-i18next/pages", () => ({ useTranslation: () => ({ t: (key) => key }) }));

describe("Gather account menu", () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(["loading", "unauthenticated"])("hides account data when %s", (status) => {
    useSession.mockReturnValue({ status });
    expect(render(<AccountMenu />).container).toBeEmptyDOMElement();
  });
  it("starts collapsed and uses the existing sign-out flow", () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: { name: "Example User" } } });
    const { container, getByText } = render(
      <AccountMenu settingsUrl="https://accounts.example.test/" notifications={<span>Notifications</span>} />,
    );
    expect(container.querySelector("details").open).toBe(false);
    expect(getByText("Example")).toBeInTheDocument();
    expect(getByText("Notifications").closest("details")).toBe(container.querySelector("details"));
    expect(getByText("Dashboard settings").closest("details")).toBe(container.querySelector("details"));
    container.querySelector("details").open = true;
    fireEvent.click(getByText("auth.signout"));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/auth/signin?autologin=0" });
  });
  it("closes on Escape and restores focus to the account trigger", () => {
    useSession.mockReturnValue({ status: "authenticated", data: { user: { name: "Example User" } } });
    const { container } = render(<AccountMenu />);
    const details = container.querySelector("details");
    details.open = true;
    fireEvent.keyDown(document, { key: "Escape" });
    expect(details.open).toBe(false);
    expect(container.querySelector("summary")).toHaveFocus();
  });
  it.each([undefined, "javascript:alert(1)", "http://accounts.example.test", "https://user:password@example.test"])(
    "rejects unsafe account URL %s",
    (value) => {
      expect(accountSettingsUrl(value)).toBeNull();
    },
  );
});
