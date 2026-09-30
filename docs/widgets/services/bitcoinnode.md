---
title: Bitcoin Node
description: Bitcoin Core node status, peers, mempool, and recent blocks
setup_url: https://github.com/daredevilbear/gather/blob/dev/docs/widgets/services/bitcoinnode.md
---

Choose **Bitcoin Node** from Gather's integration library. Enter the Bitcoin Core
JSON-RPC URL and RPC credentials (not your Umbrel web login). Set the service link
to the node's web dashboard separately.

```yaml
widget:
  type: bitcoinnode
  url: http://bitcoin-node.host:8332
  username: "{{HOMEPAGE_VAR_BITCOIN_RPC_USER}}"
  password: "{{HOMEPAGE_VAR_BITCOIN_RPC_PASSWORD}}"
```

For Umbrel, use the RPC connection details from Bitcoin Node's **Connect** panel.
The RPC endpoint must already be reachable from Gather. Credentials remain on the
server. The widget polls every 30 seconds and only issues these read-only calls:
`getblockchaininfo`, `getnetworkinfo`, `getpeerinfo`, `getmempoolinfo`, `uptime`, and
`getblock` (verbosity 1). No wallet or node-control methods are exposed.

The card shows connections, mempool RAM usage (`usage`, decimal MB), blockchain
disk usage (`size_on_disk`, decimal GB), uptime, synchronization, software version,
block height, peer networks, and the latest five available blocks with size and age.
Clearnet combines IPv4 and IPv6. Tor and I2P are counted separately; other networks
are grouped under Other. Peer addresses are not sent to the browser or geolocated.
The visualization is a peer-count ring; it does not fabricate a geographic globe.

Synchronization requires initial block download to finish, the validated block
height to catch up with headers, and verification progress to reach 99.99%.
The sync label describes the node's known chain; it does not verify freshness
against an external service. Network-disabled status is displayed separately.
Pruned nodes show their actual local disk usage. If recent block data is unavailable,
the summary stays visible with a notice and any successfully retrieved blocks.
Authentication, missing RPC permissions, and connection errors use Gather's error UI.

Allowed fields: `["connections", "mempool", "blockchainsize", "uptime", "sync", "status", "version", "height", "networks", "latestblocks"]`.
All are shown by default. For the compact four-metric summary:

```yaml
widget:
  type: bitcoinnode
  url: http://bitcoin-node.host:8332
  username: "{{HOMEPAGE_VAR_BITCOIN_RPC_USER}}"
  password: "{{HOMEPAGE_VAR_BITCOIN_RPC_PASSWORD}}"
  fields: [connections, mempool, blockchainsize, uptime]
```

RPC reference: [Bitcoin Core](https://bitcoincore.org/en/doc/31.0.0/rpc/).
