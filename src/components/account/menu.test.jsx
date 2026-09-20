// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AccountMenu, { accountSettingsUrl } from "./menu";
const { signOut, useSession } = vi.hoisted(() => ({ signOut: vi.fn(), useSession: vi.fn() }));
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
    const { container, getByText } = render(<AccountMenu settingsUrl="https://accounts.example.test/" />);
    expect(container.querySelector("details").open).toBe(false);
    expect(getByText("Example")).toBeInTheDocument();
    container.querySelector("details").open = true;
    fireEvent.click(getByText("auth.signout"));
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/auth/signin?autologin=0" });
  });
  it.each([undefined, "javascript:alert(1)", "http://accounts.example.test", "https://user:password@example.test"])(
    "rejects unsafe account URL %s",
    (value) => {
      expect(accountSettingsUrl(value)).toBeNull();
    },
  );
});
