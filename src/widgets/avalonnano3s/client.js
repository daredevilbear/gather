import { createConnection } from "node:net";

const commands = new Set(["summary", "estats"]);
const maxBytes = 256 * 1024;

export function minerAddress(widget) {
  const url = new URL(widget.url);
  if (!["http:", "https:", "tcp:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("Invalid miner URL");
  }
  // The HTTP port belongs to the web UI, not the CGMiner API.
  const port = Number(widget.port ?? (url.protocol === "tcp:" && url.port ? url.port : 4028));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid miner API port");
  return { host: url.hostname.replace(/^\[|\]$/g, ""), port };
}

export function queryMiner(address, command) {
  if (!commands.has(command)) return Promise.reject(new Error("Unsupported miner command"));
  return new Promise((resolve, reject) => {
    const socket = createConnection(address);
    const chunks = [];
    let bytes = 0;
    let finished = false;
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      socket.destroy();
      if (error) reject(error);
      else if (!bytes) reject(new Error("Empty miner response"));
      else resolve(Buffer.concat(chunks).toString("utf8"));
    };
    // Bound total time, including connect and slowly trickling responses.
    const deadline = setTimeout(() => finish(new Error("Miner API timeout")), 5000);
    socket.on("connect", () => socket.write(command));
    socket.on("data", (chunk) => {
      const end = chunk.indexOf(0);
      const data = end === -1 ? chunk : chunk.subarray(0, end);
      bytes += data.length;
      if (bytes > maxBytes) return finish(new Error("Miner response too large"));
      chunks.push(data);
      if (end !== -1) finish();
      return undefined;
    });
    socket.on("end", () => finish());
    socket.on("error", (error) => finish(error));
    socket.on("close", () => {
      if (!finished) finish(new Error("Miner connection closed unexpectedly"));
    });
  });
}
