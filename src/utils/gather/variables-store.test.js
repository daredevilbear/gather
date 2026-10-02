import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { variablesStore } from "./variables-store";

it("encrypts secrets, redacts listings and supports reversible disable", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-variables-"));
  const key = randomBytes(32);
  const store = variablesStore(dir, key);
  try {
    store.save("GATHER_VAR_TOKEN", "secret", "test-sensitive-value");
    store.save("GATHER_VAR_REGION", "variable", "west");
    expect(JSON.stringify(store.list())).not.toContain("test-sensitive-value");
    expect(
      fs.readFileSync(path.join(dir, ".gather-variables.sqlite")).includes(Buffer.from("test-sensitive-value")),
    ).toBe(false);
    expect(store.values()).toContainEqual(["GATHER_VAR_TOKEN", "test-sensitive-value"]);
    expect(() => store.save("GATHER_VAR_TOKEN", "variable", "new")).toThrow();
    store.toggle("GATHER_VAR_TOKEN", false);
    expect(store.values()).not.toContainEqual(["GATHER_VAR_TOKEN", "test-sensitive-value"]);
    store.toggle("GATHER_VAR_TOKEN", true);
    expect(store.values()).toContainEqual(["GATHER_VAR_TOKEN", "test-sensitive-value"]);
    const wrong = variablesStore(dir, randomBytes(32));
    try {
      expect(() => wrong.values()).toThrow();
    } finally {
      wrong.close();
    }
  } finally {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
