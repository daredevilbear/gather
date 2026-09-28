import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { queryClients, queryDefinition } from "./api";

function setup() {
  const stream = new EventEmitter();
  stream.cancel = vi.fn();
  const client = { Query: vi.fn(() => stream) };
  return { stream, client, result: queryClients(client, "O.test") };
}
it("encodes the official protobuf field numbers and preserves org_id", () => {
  const encoded = queryDefinition.requestSerialize({ Query: [{ VQL: "SELECT 1", Name: "test" }], org_id: "O.test" });
  expect(encoded[0]).toBe(18); // repeated Query, field 2, length-delimited
  const decoded = queryDefinition.requestDeserialize(encoded);
  expect(decoded.Query[0].VQL).toBe("SELECT 1");
  expect(decoded.org_id).toBe("O.test");
});
it("aggregates all stream batches in JSON and JSONL formats", async () => {
  const { stream, client, result } = setup();
  stream.emit("data", { Response: JSON.stringify([{ client_id: "C.1", last_seen_at: Date.now() * 1000 }]) });
  stream.emit("data", { JSONLResponse: JSON.stringify({ client_id: "C.2", last_seen_at: 0 }) + "\n" });
  stream.emit("end");
  expect(await result).toEqual({ total: 2, recent: 1, stale: 1 });
  expect(client.Query.mock.calls[0][0].org_id).toBe("O.test");
  expect(client.Query.mock.calls[0][0].Query[0].VQL).toBe("SELECT client_id, last_seen_at FROM clients()");
  expect(client.Query.mock.calls[0][1].deadline).toBeGreaterThan(Date.now());
});
it("handles no enrolled clients", async () => {
  const { stream, result } = setup();
  stream.emit("data", { Response: "[]" });
  stream.emit("end");
  expect(await result).toEqual({ total: 0, recent: 0, stale: 0 });
});
it.each([
  { Response: "bad json" },
  { log: "ERROR: Permission denied" },
  { Response: '[{"client_id":"C.1"}]' },
  { uncompressed_size: 100 },
])("rejects partial or invalid results", async (message) => {
  const { stream, result } = setup();
  stream.emit("data", message);
  stream.emit("end");
  await expect(result).rejects.toThrow();
  expect(stream.cancel).toHaveBeenCalled();
});
it("rejects failed streams even after receiving rows", async () => {
  const { stream, result } = setup();
  stream.emit("data", { Response: "[]" });
  stream.emit("error", new Error("deadline"));
  await expect(result).rejects.toThrow();
});
