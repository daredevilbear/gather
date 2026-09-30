import { cleanServiceGroups } from "utils/config/service-helpers";
import { expect, it } from "vitest";

it("strips endpoint API credentials and file paths from browser configuration", () => {
  const result = cleanServiceGroups([
    {
      name: "Security",
      services: [
        {
          name: "Endpoints",
          widgets: [
            { type: "wazuh", url: "https://private", username: "private-user", password: "private-password" },
            {
              type: "velociraptor",
              apiConfig: "/private/config.yaml",
              orgId: "O.private",
              client_private_key: "private-key",
            },
          ],
        },
      ],
    },
  ]);
  const json = JSON.stringify(result);
  expect(json).toContain("wazuh");
  expect(json).toContain("velociraptor");
  expect(json).not.toContain("private");
});
