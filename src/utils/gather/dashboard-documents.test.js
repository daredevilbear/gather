import * as yaml from "js-yaml";
import { expect, it } from "vitest";
import { renderDocuments, seedDocuments, validateDashboardDocument } from "./dashboard-documents";
const shared = {
  services: [
    {
      name: "Apps",
      services: [
        {
          name: "Server",
          href: "https://server.test",
          widgets: [{ type: "test", service_name: "Server", service_group: "Apps" }],
        },
      ],
      groups: [],
    },
  ],
  bookmarks: [],
  widgets: [{ type: "datetime", options: { index: 0, format: { timeStyle: "short" } } }],
};
it("copies presentation without integration credentials and preserves references after renaming", () => {
  const docs = seedDocuments(
    { title: "Shared", gather: { accountSettingsUrl: "https://auth.test" } },
    shared.services,
    [],
    shared.widgets,
  );
  const services = yaml.load(docs["services.yaml"]);
  services[0].Apps = [{ Renamed: services[0].Apps[0].Server }, { Mine: { href: "https://mine.test" } }];
  docs["services.yaml"] = yaml.dump(services);
  const rendered = renderDocuments(docs, shared, { gather: { notifications: true } });
  expect(rendered.services[0].services[0].name).toBe("Renamed");
  expect(rendered.services[0].services[0].widgets[0].service_name).toBe("Server");
  expect(rendered.services[0].services[1].href).toBe("https://mine.test");
  expect(rendered.settings.title).toBe("My dashboard");
  expect(rendered.settings.gather.notifications).toBe(true);
  expect(shared.services[0].services).toHaveLength(1);
});
it("rejects private connection configuration, code and environment expansion", () => {
  for (const text of [
    "- Apps:\n  - Test:\n      widget: {key: secret}",
    '- Apps:\n  - Test:\n      href: "javascript:alert(1)"',
    '- Apps:\n  - Test:\n      href: "{{SECRET}}"',
  ])
    expect(() => validateDashboardDocument("services.yaml", text)).toThrow();
  expect(() => validateDashboardDocument("custom.js", "alert(1)")).toThrow();
  expect(() => validateDashboardDocument("settings.yaml", "gather: {accountMenu: false}")).toThrow();
});

it("rejects personal source credentials for guided integration widgets", () => {
  expect(() => validateDashboardDocument("widgets.yaml", "- weatherapi: {apiKey: fictional}")).toThrow(/credentials/);
  for (const type of ["calendar", "wazuh", "velociraptor", "iframe"]) {
    expect(() =>
      validateDashboardDocument("services.yaml", yaml.dump([{ Lab: [{ Example: { widget: { type } } }] }])),
    ).toThrow(/credentials/);
  }
});
