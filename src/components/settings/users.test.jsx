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
  expect(screen.getByText("Review access change")).toBeInTheDocument();
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
