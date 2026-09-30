import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { preferencesStore } from "./preferences-store";

it("persists preferences independently for each account", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "gather-preferences-"));
  let store = preferencesStore(directory);
  try {
    expect(store.read("one")).toEqual({ widgetsPosition: "below" });
    store.save("one", { widgetsPosition: "above" });
    expect(store.read("two")).toEqual({ widgetsPosition: "below" });
    expect(() => store.save("one", { widgetsPosition: "invalid" })).toThrow();
    store.close(); store = preferencesStore(directory);
    expect(store.read("one")).toEqual({ widgetsPosition: "above" });
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
