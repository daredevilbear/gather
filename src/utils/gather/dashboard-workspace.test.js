import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { workspaceStore } from "./dashboard-workspace";
let dir, store;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "gather-workspace-"));
  store = workspaceStore(dir);
});
afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
it("isolates documents, revisions, and current choices by owner", () => {
  store.initialize("alice", { "settings.yaml": "title: Alice" });
  store.initialize("bob", { "settings.yaml": "title: Bob" });
  store.save("alice", { "settings.yaml": "title: New" }, 1);
  expect(store.get("bob").documents["settings.yaml"]).toBe("title: Bob");
  expect(() => store.save("alice", {}, 1)).toThrow("changed");
  store.select("alice", "mine");
  expect(store.current("bob")).toBe("shared");
  expect(store.current("alice")).toBe("mine");
  expect(store.version("alice", 1)["settings.yaml"]).toBe("title: Alice");
  expect(store.backups("bob")).toEqual([]);
});
it("revokes shared links and creates a new token when shared again", () => {
  store.initialize("alice", {});
  const token = store.sharing("alice", true);
  expect(store.shared(token)).toBe("alice");
  store.select("bob", token);
  store.sharing("alice", false);
  expect(store.shared(token)).toBeUndefined();
  expect(store.sharing("alice", true)).not.toBe(token);
});
