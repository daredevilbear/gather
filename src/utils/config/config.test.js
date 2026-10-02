import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import cache from "memory-cache";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("utils/config/config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    cache.del("gatherEnvironmentVariables");
  });

  afterEach(() => {
    process.env = originalEnv;
    cache.del("gatherEnvironmentVariables");
  });

  it("substituteEnvironmentVars replaces GATHER_VAR_* placeholders", async () => {
    process.env.GATHER_VAR_FOO = "bar";

    const mod = await import("./config");
    expect(mod.substituteEnvironmentVars("x {{GATHER_VAR_FOO}} y")).toBe("x bar y");
  });

  it("substituteEnvironmentVars replaces GATHER_FILE_* placeholders with file contents", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gather-config-test-"));
    const secretPath = path.join(dir, "secret.txt");
    writeFileSync(secretPath, "secret", "utf8");

    process.env.GATHER_FILE_SECRET = secretPath;

    const mod = await import("./config");
    expect(mod.substituteEnvironmentVars("token={{GATHER_FILE_SECRET}}")).toBe("token=secret");
  });

  it("getSettings reads from GATHER_CONFIG_DIR and converts layout list to an object", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gather-settings-test-"));
    process.env.GATHER_CONFIG_DIR = dir;
    process.env.GATHER_VAR_TITLE = "MyTitle";

    // Create a minimal settings.yaml; checkAndCopyConfig will see it exists and won't copy skeleton.
    writeFileSync(
      path.join(dir, "settings.yaml"),
      ['title: "{{GATHER_VAR_TITLE}}"', "layout:", "  - GroupA:", "      style: row"].join("\n"),
      "utf8",
    );

    vi.resetModules(); // ensure CONF_DIR is computed from updated env
    const mod = await import("./config");

    const settings = mod.getSettings();
    expect(settings.title).toBe("MyTitle");
    expect(settings.layout).toEqual({ GroupA: { style: "row" } });
  });
});
