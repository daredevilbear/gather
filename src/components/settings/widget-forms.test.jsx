// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import * as yaml from "js-yaml";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import SettingsEditor from "./editor";
import { IntegrationPicker } from "./pickers";
import { createPreviewStore } from "./preview-store";

vi.mock("next/head", () => ({ default: ({ children }) => children }));
vi.mock("next/link", () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }));
function Integration({ initial }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <IntegrationPicker value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}
const result = () => JSON.parse(screen.getByTestId("value").textContent);
const edit = (name, value) => fireEvent.change(screen.getByLabelText(name, { exact: false }), { target: { value } });

it.each(["Calendar", "Wazuh", "Velociraptor", "IFrame"])("discovers %s by name", (name) => {
  render(<Integration initial={null} />);
  fireEvent.click(screen.getByRole("button", { name: "Choose integration widget" }));
  edit("Search widgets", name);
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
  expect(result().type).toBe(name.toLowerCase());
});

it("edits Calendar sources without losing unknown source or nested properties", () => {
  const initial = {
    type: "calendar",
    extra: { retain: true },
    integrations: [
      { type: "ical", name: "Family", url: "{{HOMEPAGE_VAR_CALENDAR}}", params: { custom: 42 } },
      { type: "future", custom: { keep: true } },
    ],
  };
  render(<Integration initial={initial} />);
  expect(screen.getByLabelText(/iCal feed URL/)).toHaveAttribute("type", "password");
  fireEvent.click(screen.getByLabelText("Show feed name before events"));
  edit(/^View/, "agenda");
  expect(result()).toEqual({
    ...initial,
    view: "agenda",
    integrations: [{ ...initial.integrations[0], params: { custom: 42, showName: true } }, initial.integrations[1]],
  });
  edit("Source type", "radarr");
  fireEvent.click(screen.getByRole("button", { name: "Add event source" }));
  edit("Service group", "Media");
  edit("Service name", "Movies");
  fireEvent.click(screen.getByLabelText("Only missing monitored movies"));
  expect(result().integrations[2]).toEqual({
    type: "radarr",
    service_group: "Media",
    service_name: "Movies",
    missingOnly: true,
  });
  fireEvent.click(screen.getByRole("button", { name: "Remove event source 2" }));
  expect(result().integrations).toHaveLength(2);
});

it.each(["sonarr", "radarr", "lidarr", "readarr"])("offers the supported %s source connection", (type) => {
  render(<Integration initial={{ type: "calendar", integrations: [{ type }] }} />);
  expect(screen.getByLabelText("Service group")).toBeRequired();
  expect(screen.getByLabelText("Service name")).toBeRequired();
  expect(screen.getByLabelText("Include unmonitored items")).toBeInTheDocument();
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
});

it("validates calendar names, feed URLs, time zones and integer limits", () => {
  render(
    <Integration
      initial={{
        type: "calendar",
        integrations: [
          { type: "ical", name: "Work" },
          { type: "ical", name: "Work" },
        ],
      }}
    />,
  );
  expect(screen.getAllByLabelText("Feed name")[0]).toBeInvalid();
  fireEvent.change(screen.getAllByLabelText("Feed name")[1], { target: { value: "Home" } });
  expect(screen.getAllByLabelText("Feed name")[0]).toBeValid();
  const url = screen.getAllByLabelText(/iCal feed URL/)[0];
  expect(url).toBeInvalid();
  fireEvent.change(url, { target: { value: "file:///secret" } });
  expect(url).toBeInvalid();
  fireEvent.change(url, { target: { value: "{{HOMEPAGE_VAR_CALENDAR}}" } });
  expect(url).toBeValid();
  edit(/Timezone/, "Not/AZone");
  expect(screen.getByLabelText(/Timezone/)).toBeInvalid();
  edit(/Timezone/, "America/Los_Angeles");
  expect(screen.getByLabelText(/Timezone/)).toBeValid();
  edit(/Max Events/, "1.5");
  expect(screen.getByLabelText(/Max Events/)).toBeInvalid();
  edit(/Max Events/, "10");
  expect(screen.getByLabelText(/Max Events/)).toBeValid();
});

it("uses Wazuh credentials and preserves placeholders and unknown fields", () => {
  render(<Integration initial={{ type: "wazuh", password: "{{HOMEPAGE_VAR_PASS}}", custom: 8 }} />);
  expect(screen.getByLabelText(/Password/)).toHaveAttribute("type", "password");
  expect(screen.getByLabelText(/Server URL/)).toBeInvalid();
  edit(/Server URL/, "ftp://wrong.test");
  expect(screen.getByLabelText(/Server URL/)).toBeInvalid();
  edit(/Server URL/, "https://wazuh.example.test:55000");
  edit("Username", "reader");
  fireEvent.click(screen.getByLabelText("Active", { exact: true }));
  expect(result()).toEqual({
    type: "wazuh",
    password: "{{HOMEPAGE_VAR_PASS}}",
    custom: 8,
    url: "https://wazuh.example.test:55000",
    username: "reader",
    fields: ["active"],
  });
});

it("configures Velociraptor using a server-side file, never reads certificates", () => {
  const fetcher = vi.spyOn(globalThis, "fetch");
  render(<Integration initial={{ type: "velociraptor" }} />);
  const path = screen.getByLabelText(/API client file path/);
  expect(path).toBeRequired();
  fireEvent.change(path, { target: { value: "/app/config/fictional-api.yaml" } });
  edit(/Organization ID/, "O.fictional");
  expect(result()).toEqual({ type: "velociraptor", apiConfig: "/app/config/fictional-api.yaml", orgId: "O.fictional" });
  expect(fetcher).not.toHaveBeenCalled();
  fetcher.mockRestore();
});

async function seededStore(file, value) {
  const store = createPreviewStore();
  const doc = await store(null, file);
  await store({ action: "save", file, text: yaml.dump(value), revision: doc.revision });
  return store;
}

describe("saved configuration and boundaries", () => {
  it("round trips Calendar and both security integrations through visual/source and save", async () => {
    const integrations = [
      {
        type: "calendar",
        custom: [1, 2],
        integrations: [{ type: "ical", name: "Events", url: "{{HOMEPAGE_VAR_FEED}}", params: { custom: true } }],
      },
      {
        type: "wazuh",
        url: "https://wazuh.example.test:55000",
        username: "reader",
        password: "{{HOMEPAGE_VAR_PASS}}",
        future: true,
      },
      { type: "velociraptor", apiConfig: "/app/config/api.yaml", orgId: "O.test", future: true },
    ];
    const value = [{ Lab: integrations.map((widget) => ({ [widget.type]: { widget } })) }];
    const store = await seededStore("services.yaml", value);
    render(<SettingsEditor request={store} preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    await screen.findByText("Event sources");
    edit(/^View/, "agenda");
    fireEvent.click(screen.getByRole("button", { name: "Source", exact: true }));
    expect(yaml.load(screen.getByLabelText("services.yaml").value)[0].Lab[0].calendar.widget.view).toBe("agenda");
    fireEvent.click(screen.getByRole("button", { name: "Visual", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    value[0].Lab[0].calendar.widget.view = "agenda";
    expect(yaml.load((await store(null, "services.yaml")).text)).toEqual(value);
  });
  it("adds WeatherAPI, blocks partial coordinates, and saves unknown settings and secret references", async () => {
    const store = await seededStore("widgets.yaml", []);
    const request = vi.fn(store);
    render(<SettingsEditor request={request} preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "Home widgets", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Home widget" }));
    edit("Search widgets", "WeatherAPI");
    fireEvent.click(screen.getByRole("button", { name: /^WeatherAPI/ }));
    edit("Latitude", "0");
    edit(/WeatherAPI key/, "{{HOMEPAGE_VAR_WEATHER}}");
    request.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Longitude")).toBeInvalid();
    edit("Longitude", "0");
    edit("Units", "imperial");
    fireEvent.click(screen.getByRole("button", { name: "Source", exact: true }));
    const raw = screen.getByLabelText("widgets.yaml");
    const parsed = yaml.load(raw.value);
    parsed[0].weatherapi.future = { untouched: true };
    fireEvent.change(raw, { target: { value: yaml.dump(parsed) } });
    fireEvent.click(screen.getByRole("button", { name: "Visual", exact: true }));
    edit("Location name", "Fictional station");
    fireEvent.click(screen.getByRole("button", { name: "Save & apply" }));
    await screen.findByText(/Saved and applied/);
    expect(yaml.load((await store(null, "widgets.yaml")).text)).toEqual([
      { weatherapi: { ...parsed[0].weatherapi, label: "Fictional station" } },
    ]);
  });
  it("keeps credential-backed widgets out of personal libraries", async () => {
    const store = createPreviewStore();
    const request = (payload, file) =>
      file === "shared-services"
        ? Promise.resolve({ services: [{ group: "Lab", name: "Wazuh" }] })
        : store(payload, file);
    render(<SettingsEditor request={request} personal preview />);
    await screen.findByLabelText("Dashboard title");
    fireEvent.click(screen.getByRole("button", { name: "Home widgets", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Add Home widget" }));
    expect(screen.queryByRole("button", { name: /^WeatherAPI/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Services", exact: true }));
    expect(await screen.findAllByLabelText(/Shared integration/)).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Choose integration widget" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API client file path/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
    expect(
      await within(screen.getAllByLabelText(/Shared integration/)[0]).findByRole("option", { name: "Lab / Wazuh" }),
    ).toBeInTheDocument();
  });
});

it("does not expose credential inputs on inherited personal WeatherAPI widgets", async () => {
  const store = await seededStore("widgets.yaml", [{ weatherapi: { gatherSharedWidget: 0, provider: "weatherapi" } }]);
  render(<SettingsEditor request={store} personal preview />);
  await screen.findByLabelText("Dashboard title");
  fireEvent.click(screen.getByRole("button", { name: "Home widgets", exact: true }));
  await screen.findByLabelText("Location name");
  expect(screen.queryByLabelText(/WeatherAPI key/)).not.toBeInTheDocument();
});

it("edits iframe options while preserving custom configuration", () => {
  render(<Integration initial={{ type: "iframe", future: { keep: true } }} />);
  edit("Page URL", "javascript:alert(1)");
  expect(screen.getByLabelText("Page URL")).toBeInvalid();
  edit("Page URL", "https://frame.example.test");
  edit("Frame name", "Fictional frame");
  edit("Loading Strategy", "lazy");
  fireEvent.click(screen.getByLabelText("Allow full screen"));
  expect(result()).toEqual({
    type: "iframe",
    future: { keep: true },
    src: "https://frame.example.test",
    name: "Fictional frame",
    loadingStrategy: "lazy",
    allowfullscreen: true,
  });
});
