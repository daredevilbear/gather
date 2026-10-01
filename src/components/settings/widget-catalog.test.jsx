// @vitest-environment jsdom
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_WIDGETS, SERVICE_WIDGETS } from "./pickers";
import policy from "./widget-catalog-policy.json";

const fileURL = (file) => new URL(file, import.meta.url);
const source = (file) => readFileSync(fileURL(file), "utf8");
const renderers = (file) => [...source(file).matchAll(/^  (\w+): dynamic\(/gm)].map((match) => match[1]);
const sorted = (items) => [...items].sort();

describe("widget catalog runtime parity", () => {
  it("accounts for component implementations that are not in the service registry", () => {
    const directory = fileURL("../../widgets/");
    const components = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(new URL(`${entry.name}/component.jsx`, directory)))
      .map((entry) => entry.name);
    const registered = new Set(renderers("../../widgets/components.js"));
    expect(sorted(components.filter((id) => !registered.has(id)))).toEqual(
      sorted(Object.keys(policy.standaloneComponentExceptions)),
    );
  });
  it("accounts for every service renderer and refuses stale exceptions or non-renderable entries", () => {
    const implemented = renderers("../../widgets/components.js");
    const offered = SERVICE_WIDGETS.map(({ id }) => id);
    expect(new Set(offered).size).toBe(offered.length);
    expect(sorted([...offered, ...Object.keys(policy.serviceRendererExceptions)])).toEqual(sorted(implemented));
  });
  it("accounts for every proxy registration, including internal aliases", () => {
    const proxies = [...source("../../widgets/widgets.js").matchAll(/^  (\w+)(?:: \w+)?,/gm)].map((match) => match[1]);
    const offered = new Set(SERVICE_WIDGETS.map(({ id }) => id));
    expect(sorted(proxies.filter((id) => !offered.has(id)))).toEqual(sorted(Object.keys(policy.proxyOnlyExceptions)));
  });
  it("offers every Home renderer exactly once", () => {
    expect(sorted(HOME_WIDGETS.map(({ id }) => id))).toEqual(sorted(renderers("../widgets/widget.jsx")));
  });
  it("requires an explicit reason for every Home widget excluded from personal configuration", () => {
    expect(sorted([...policy.personalHomeAllowed, ...Object.keys(policy.personalHomeExceptions)])).toEqual(
      sorted(HOME_WIDGETS.map(({ id }) => id)),
    );
    for (const exceptions of [
      policy.standaloneComponentExceptions,
      policy.serviceRendererExceptions,
      policy.proxyOnlyExceptions,
      policy.personalHomeExceptions,
    ]) {
      for (const reason of Object.values(exceptions)) expect(reason.length).toBeGreaterThan(30);
    }
  });
});
