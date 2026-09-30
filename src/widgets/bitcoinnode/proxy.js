import getServiceWidget from "utils/config/service-helpers";
import { httpProxy } from "utils/proxy/http";

const summaryMethods = ["getblockchaininfo", "getnetworkinfo", "getpeerinfo", "getmempoolinfo", "uptime"];

export function summarize(chain, network, peers, mempool, uptime) {
  if (
    !Number.isInteger(chain?.blocks) ||
    !Number.isInteger(chain?.headers) ||
    !Array.isArray(peers) ||
    typeof network?.networkactive !== "boolean" ||
    typeof chain.verificationprogress !== "number" ||
    typeof chain.initialblockdownload !== "boolean"
  )
    throw new Error("Invalid Bitcoin Core response");
  const connections = { clearnet: 0, tor: 0, i2p: 0, other: 0 };
  peers.forEach((peer) => {
    const key = ["ipv4", "ipv6"].includes(peer.network)
      ? "clearnet"
      : peer.network === "onion"
        ? "tor"
        : peer.network === "i2p"
          ? "i2p"
          : "other";
    connections[key] += 1;
  });
  return {
    version: typeof network.subversion === "string" ? network.subversion.replace(/^\/+|\/+$/g, "") : null,
    networkActive: network.networkactive,
    chain: chain.chain,
    height: chain.blocks,
    headers: chain.headers,
    progress: Math.min(1, Math.max(0, chain.verificationprogress)),
    synced: !chain.initialblockdownload && chain.blocks >= chain.headers && chain.verificationprogress >= 0.9999,
    blockchainSize: chain.size_on_disk ?? null,
    pruned: chain.pruned === true,
    mempool: mempool?.usage ?? null,
    mempoolTransactions: mempool?.size ?? null,
    uptime: typeof uptime === "number" && uptime >= 0 ? uptime : null,
    peers: connections,
    connections: peers.length,
  };
}

export default async function bitcoinNodeProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;
  if (!group || !service || endpoint !== "info")
    return res.status(400).json({ error: { message: "Invalid Bitcoin Node request" } });
  if (req.method && req.method !== "GET") return res.status(405).json({ error: { message: "Unsupported method" } });
  try {
    const widget = await getServiceWidget(group, service, index);
    if (widget?.type !== "bitcoinnode" || !widget.url || !widget.username || !widget.password) {
      return res.status(400).json({ error: { message: "Configure the Bitcoin Core RPC URL, username, and password" } });
    }
    const url = new URL(widget.url);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid RPC URL");
    async function rpc(calls) {
      // All methods and parameters originate here; never forward a caller's body or RPC method.
      const [status, , raw] = await httpProxy(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        auth: `${widget.username}:${widget.password}`,
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify(calls.map(([method, params = []], id) => ({ jsonrpc: "2.0", id, method, params }))),
      });
      if (status !== 200)
        throw new Error(
          status === 401 || status === 403
            ? "Bitcoin Core RPC authentication or access denied"
            : "Bitcoin Core RPC is unavailable",
        );
      const payload = Buffer.isBuffer(raw) || typeof raw === "string" ? JSON.parse(raw.toString()) : raw;
      if (!Array.isArray(payload)) throw new Error("Invalid Bitcoin Core RPC response");
      return calls.map(([method], id) => {
        const matches = payload.filter((item) => item?.id === id);
        const result = matches[0];
        if (matches.length !== 1 || result.error || result.result === undefined || result.result === null) {
          throw new Error(`Bitcoin Core RPC ${method} failed`);
        }
        return result.result;
      });
    }
    const [chain, network, peers, mempool, uptime] = await rpc(summaryMethods.map((method) => [method]));
    const data = summarize(chain, network, peers, mempool, uptime);
    const blocks = [];
    let hash = chain.bestblockhash;
    let blocksUnavailable = false;
    for (let i = 0; i < Math.min(5, chain.blocks + 1); i += 1) {
      try {
        if (typeof hash !== "string" || !/^[a-f0-9]{64}$/i.test(hash)) throw new Error("Missing block hash");
        const [block] = await rpc([["getblock", [hash, 1]]]);
        if (!Number.isInteger(block.height) || !Number.isFinite(block.size) || !Number.isFinite(block.time))
          throw new Error("Invalid block");
        blocks.push({ hash, height: block.height, size: block.size, time: block.time });
        hash = block.previousblockhash;
      } catch {
        // Pruned or temporarily unavailable blocks must not hide the node summary.
        blocksUnavailable = true;
        break;
      }
    }
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ...data, blocks, blocksUnavailable, updatedAt: Date.now() });
  } catch (error) {
    // Do not return raw upstream responses, peer addresses, or credential-bearing URLs.
    const message = error.message?.startsWith("Bitcoin Core RPC")
      ? error.message
      : "Unable to read Bitcoin Core RPC data";
    return res.status(502).json({ error: { message } });
  }
}
