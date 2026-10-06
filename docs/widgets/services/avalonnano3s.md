---
title: Avalon Nano 3s
description: Avalon Nano 3s miner telemetry widget configuration
setup_url: https://github.com/daredevilbear/gather/blob/dev/docs/widgets/services/avalonnano3s.md
---

Available on the `dev` channel; this integration is not included in the current stable release.

Select **Avalon Nano 3s** in the integration library and enter the miner's web URL.
For an existing service, keep its name, link, description and icon, then add:

```yaml
widget:
  type: avalonnano3s
  url: http://192.0.2.10
  port: 4028 # optional; TCP API port, default 4028
```

Gather's server must be able to reach the miner's TCP API. The URL identifies
the host; its HTTP port is ignored. The optional `port` selects the TCP API port.
`tcp://192.0.2.10:4028` is also supported. No API key or web password is needed.

The card refreshes every 10 seconds and displays current and average hash rate
in TH/s, average and maximum ASIC temperature, fan RPM and speed, accepted
shares, rejected-share percentage and count, hardware errors, best share
difficulty, and miner uptime. Hash rates use CGMiner's `MHS 5s` and `MHS av`,
converted from MH/s to TH/s. Uptime and share counters cover the current miner
session. Rejected-share percentage is `100 × Rejected / (Accepted + Rejected)`;
missing counters or no submitted shares show `N/A`. It is separate from
hardware errors. Missing or invalid readings show `N/A`; zero readings remain
zero. The timestamp shows the last successful fetch. Connection failures use
Gather's standard error display.

Allowed fields:
`["hashrate", "averagehashrate", "temperature", "fan", "accepted", "rejectedshares", "hardwareerrors", "bestdifficulty", "uptime"]`.
All fields display by default. Highlight thresholds for hash rate use TH/s,
temperature uses °C, rejected shares uses percent, and fan uses RPM.

Only the read-only `summary` and `estats` commands are sent. The browser receives
allowlisted telemetry; raw device identifiers, configuration, and credentials
are excluded. Each TCP request has a five-second deadline and a 256 KiB limit.
This widget does not change pools, work mode, fans, LEDs, or miner power state.

Protocol reference: [Canaan Nano 3s API](https://www.canaan.io/resource/api/avalon-nano-3s).
