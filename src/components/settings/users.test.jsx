// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import Users from "./users";
it("prepares access through a review and filters people by email", async () => {
  render(<Users preview />);
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add user" }));
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Alice" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "alice@example.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Review new user" }));
  expect(screen.getByText("Review access change")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
  await screen.findByText("2 registered people");
  fireEvent.change(screen.getByLabelText("Find a person"), { target: { value: "alice@" } });
  expect(screen.queryByText("Preview User")).not.toBeInTheDocument();
  expect(screen.getByText("Alice")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Access status"), { target: { value: "active" } });
  expect(screen.queryByText("Alice")).not.toBeInTheDocument();
});
it("normalizes search terms, reports empty matches and keeps adding separate", async () => {
  render(<Users preview />);
  fireEvent.change(screen.getByLabelText("Find a person"), { target: { value: "  PREVIEW   user  " } });
  expect(screen.getByText("1 of 1 people match")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Find a person"), { target: { value: "nobody" } });
  expect(screen.getByText("0 of 1 people match")).toBeInTheDocument();
  expect(screen.getByText(/No matching users/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search & filters" }));
  expect(screen.getByText("1 of 1 people match")).toBeInTheDocument();
});

it("opens the add form before search, focuses it and restores focus on cancel", () => {
  render(<Users preview />);
  const add = screen.getByRole("button", { name: "Add user" });
  fireEvent.click(add);
  const name = screen.getByLabelText("Name");
  expect(name).toHaveFocus();
  expect(add).toHaveAttribute("aria-expanded", "true");
  expect(
    name.compareDocumentPosition(screen.getByLabelText("Find a person")) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  fireEvent.change(name, { target: { value: "Unfinished" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel adding user" }));
  expect(add).toHaveFocus();
  expect(add).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  fireEvent.click(add);
  expect(screen.getByLabelText("Name")).toHaveFocus();
  expect(screen.getByLabelText("Name")).toHaveValue("");
});

it("creates and resets local credentials through review without displaying passwords", async () => {
  const { vi } = await import("vitest");
  const base = { users: [], activity: [], canAddUsers: true, localLogin: true, currentUserId: "admin" };
  const user = {
    id: "alice",
    name: "Alice",
    email: "alice@example.test",
    username: "alice",
    role: "editor",
    enabled: true,
  };
  const fetcher = vi.fn(async (url, options) => ({
    ok: true,
    json: async () => (options ? { ...base, users: [user] } : base),
  }));
  vi.stubGlobal("fetch", fetcher);
  try {
    render(<Users />);
    await screen.findByText("0 registered people");
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: user.name } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: user.email } });
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: user.username } });
    fireEvent.change(screen.getByLabelText("Initial password"), { target: { value: "Initial-local-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Review new user" }));
    expect(screen.queryByText("Initial-local-password")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
    await screen.findByText("1 registered person");
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toMatchObject({
      action: "add",
      username: "alice",
      password: "Initial-local-password",
    });
    fireEvent.click(screen.getByText("Alice"));
    fireEvent.click(screen.getByRole("button", { name: "Reset password for Alice" }));
    fireEvent.change(screen.getByLabelText("New password for Alice"), {
      target: { value: "Replacement-local-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review password reset" }));
    expect(screen.getByText(/Existing sessions will be signed out/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm access change" }));
    await screen.findByRole("button", { name: "Reset password for Alice" });
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).toMatchObject({
      action: "resetPassword",
      id: "alice",
      password: "Replacement-local-password",
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
