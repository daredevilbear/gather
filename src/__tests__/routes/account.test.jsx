// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { AccountPreferencesContent } from "pages/account";
import { expect, it, vi } from "vitest";
it("saves the selected position and waits for the server response", async () => {
  const mutate = vi.fn();
  const request = vi.fn(async () => ({ ok: true, json: async () => ({ widgetsPosition: "above" }) }));
  render(<AccountPreferencesContent data={{ widgetsPosition: "below" }} mutate={mutate} request={request} />);
  fireEvent.click(screen.getByRole("button", { name: /Above tabs/ }));
  await screen.findByText("Saved for your account.");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ widgetsPosition: "above" });
  expect(mutate).toHaveBeenCalledWith({ widgetsPosition: "above" }, false);
});
it("keeps the saved selection when saving fails", async () => {
  render(
    <AccountPreferencesContent
      data={{ widgetsPosition: "below" }}
      mutate={vi.fn()}
      request={async () => ({ ok: false })}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Above tabs/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  expect(screen.getByRole("button", { name: /Below tabs/ })).toHaveAttribute("aria-pressed", "true");
});
