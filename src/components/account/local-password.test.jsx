// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import LocalPassword from "./local-password";
it("requires current credentials, clears the password fields and requests a fresh sign-in", async () => {
  const request = vi.fn(async () => ({ ok: true, json: async () => ({ changed: true }) }));
  render(<LocalPassword request={request} />);
  fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "Old-local-password" } });
  fireEvent.change(screen.getByLabelText("New password"), { target: { value: "New-local-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Change password" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    currentPassword: "Old-local-password",
    password: "New-local-password",
  });
  expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute(
    "href",
    "/auth/signin?callbackUrl=%2Faccount",
  );
});
