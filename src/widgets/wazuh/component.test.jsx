// @vitest-environment jsdom
import { renderWithProviders } from "test-utils/render-with-providers";
import { expectBlockValue } from "test-utils/widget-assertions";
import useWidgetAPI from "utils/proxy/use-widget-api";
import { expect, it, vi } from "vitest";
import Velociraptor from "../velociraptor/component";
import Wazuh from "./component";

vi.mock("utils/proxy/use-widget-api", () => ({ default: vi.fn() }));

it.each([
  ["wazuh", Wazuh, 5],
  ["velociraptor", Velociraptor, 3],
])("%s shows placeholders, zero counts and selected fields", (type, Component, count) => {
  useWidgetAPI.mockReturnValue({});
  const { container, unmount } = renderWithProviders(<Component service={{ widget: { type } }} />);
  expect(container.querySelectorAll(".service-block.animate-pulse")).toHaveLength(count);
  useWidgetAPI.mockReturnValue({ data: { total: 0 } });
  unmount();
  const { container: loaded } = renderWithProviders(<Component service={{ widget: { type, fields: ["total"] } }} />);
  expect(loaded.querySelectorAll(".service-block")).toHaveLength(1);
  expectBlockValue(loaded, `${type}.total`, 0);
});
it.each([
  ["wazuh", Wazuh],
  ["velociraptor", Velociraptor],
])("%s displays an error instead of misleading counts", (type, Component) => {
  useWidgetAPI.mockReturnValue({ error: "API unavailable" });
  const { container } = renderWithProviders(<Component service={{ widget: { type } }} />, {
    settings: { hideErrors: false },
  });
  expect(container.querySelectorAll(".service-block")).toHaveLength(0);
  expect(container.textContent).toContain("API unavailable");
});
