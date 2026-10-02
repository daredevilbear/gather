// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import Variables from "./variables";

it("offers a masked secret editor and never shows saved preview secrets", async () => {
  const dirty = vi.fn();
  render(<Variables preview onDirtyChange={dirty} />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "API_TOKEN" } });
  fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "private-value" } });
  expect(screen.getByLabelText("Secret value")).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByRole("button", { name: "Save value" }));
  expect(await screen.findByText("Secret · value hidden · Enabled")).toBeInTheDocument();
  expect(screen.getByLabelText("Secret value")).toHaveValue("");
  expect(document.body.textContent).not.toContain("private-value");
  fireEvent.click(screen.getByRole("button", { name: "Disable" }));
  expect(await screen.findByText("Secret · value hidden · Disabled")).toBeInTheDocument();
});

it("opens and focuses a replacement, locks its identity and saves without exposing the secret", async () => {
  render(<Variables preview />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "API_TOKEN" } });
  fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "old-value" } });
  fireEvent.click(screen.getByRole("button", { name: "Save value" }));
  fireEvent.click(await screen.findByRole("button", { name: "Replace value" }));
  expect(screen.getByLabelText("Name")).toHaveAttribute("readonly");
  expect(screen.getByLabelText("Secret value")).toHaveFocus();
  expect(screen.getByLabelText("Secret value")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("Secret value"), { target: { value: "replacement-value" } });
  fireEvent.click(screen.getByRole("button", { name: "Save replacement" }));
  expect(await screen.findByRole("button", { name: "Save value" })).toBeDisabled();
  expect(document.body.textContent).not.toContain("replacement-value");
  expect(screen.getAllByText("GATHER_VAR_API_TOKEN", { exact: true })).toHaveLength(1);
});
