import { EventEmitter } from "node:events";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createConnection } from "node:net";
import { minerAddress, queryMiner } from "./client";

vi.mock("node:net", () => ({ createConnection: vi.fn() }));
let socket;
beforeEach(() => {
  vi.useFakeTimers();
  socket = new EventEmitter();
  socket.write = vi.fn();
  socket.destroy = vi.fn();
  createConnection.mockReturnValue(socket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("Nano 3s TCP transport", () => {
  it("ignores the web port and supports API port overrides and IPv6", () => {
    expect(minerAddress({ url: "http://miner.local:8080" })).toEqual({ host: "miner.local", port: 4028 });
    expect(minerAddress({ url: "tcp://miner.local:4029" })).toEqual({ host: "miner.local", port: 4029 });
    expect(minerAddress({ url: "http://[::1]", port: 4030 })).toEqual({ host: "::1", port: 4030 });
  });
  it.each([
    { url: "bad" },
    { url: "file:///tmp/miner" },
    { url: "http://user:secret@miner" },
    { url: "http://miner", port: 0 },
    { url: "http://miner", port: 65536 },
    { url: "http://miner", port: 4028.5 },
  ])("rejects invalid address %s", (widget) => {
    expect(() => minerAddress(widget)).toThrow();
  });
  it("joins fragmented responses through a NUL terminator without forwarding trailing data", async () => {
    const promise = queryMiner({ host: "miner", port: 4028 }, "summary");
    socket.emit("connect");
    expect(socket.write).toHaveBeenCalledWith("summary");
    socket.emit("data", Buffer.from("STATUS=S|SUM"));
    socket.emit("data", Buffer.from("MARY,Accepted=1|\0ignore"));
    await expect(promise).resolves.toBe("STATUS=S|SUMMARY,Accepted=1|");
    expect(socket.destroy).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("supports responses terminated by EOF", async () => {
    const promise = queryMiner({ host: "miner", port: 4028 }, "estats");
    socket.emit("data", Buffer.from("STATUS=S|STATS=0|"));
    socket.emit("end");
    await expect(promise).resolves.toBe("STATUS=S|STATS=0|");
  });
  it("rejects arbitrary commands without opening a socket", async () => {
    await expect(queryMiner({ host: "miner", port: 4028 }, "reboot")).rejects.toThrow("Unsupported");
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("times out trickling data using a total deadline and destroys the connection", async () => {
    const promise = queryMiner({ host: "miner", port: 4028 }, "summary");
    const assertion = expect(promise).rejects.toThrow("timeout");
    await vi.advanceTimersByTimeAsync(4000);
    socket.emit("data", Buffer.from("STATUS=S|"));
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
  it("bounds response size", async () => {
    const promise = queryMiner({ host: "miner", port: 4028 }, "summary");
    socket.emit("data", Buffer.alloc(256 * 1024 + 1, 65));
    await expect(promise).rejects.toThrow("too large");
    expect(socket.destroy).toHaveBeenCalledOnce();
  });
  it("rejects empty responses, connection resets and socket errors", async () => {
    for (const event of ["end", "close", "error"]) {
      const promise = queryMiner({ host: "miner", port: 4028 }, "summary");
      socket.emit(event, new Error("Connection refused"));
      await expect(promise).rejects.toThrow();
    }
  });
});
