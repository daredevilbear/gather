---
title: NerdAxe
description: NerdAxe / NerdQAxe miner widget configuration
setup_url: https://github.com/daredevilbear/gather/blob/dev/docs/widgets/services/nerdaxe.md
---

Select **NerdAxe / NerdQAxe** in Gather's integration library and enter the miner's
base URL. For an existing NerdAxe service, change its widget type from `bitaxe`
to `nerdaxe`, retaining its URL, name, and link.

```yaml
widget:
  type: nerdaxe
  url: http://192.168.100.11
```

Gather must be able to reach the miner. No API key is required. The card uses
the Bitaxe layout and refreshes the read-only `/api/system/info` every 10 seconds.
It displays hash rate, ASIC and VR temperature, voltage, best difficulty,
rejected-share percentage, pool ping, fan RPM and speed, session best difficulty,
and the primary or fallback pool.

**Pool Ping** uses `stratum.pools[].pingRtt` in milliseconds when exactly one pool
is connected, falling back to `lastpingrtt`. Multiple connected pools use
`lastpingrtt`; explicitly disconnected pools show `N/A`. This is network ping RTT,
not Bitaxe's share-response latency. Nonpositive or unavailable ping shows `N/A`.

**Rejected Shares** is `100 × sharesRejected / (sharesAccepted + sharesRejected)`.
It is not a hardware error rate. Missing counters or no submitted shares show
`N/A`; accepted shares with zero rejects show `0.00%`.

Allowed fields: `["hashrate", "temperature", "voltage", "bestdifficulty", "rejectedshares", "poolping", "fan", "sessionbest", "pool"]`.
All fields display by default. When migrating from Bitaxe, update any `fields`
and `highlight` entries from `errorrate` to `rejectedshares` and from
`poollatency` to `poolping`. The fan tile shows the first fan (`fanrpm` / `fanspeed`).
Voltage is converted from millivolts to volts. The timestamp shows the last
successful fetch; unreachable devices use the standard error display.

Only allowlisted card telemetry reaches the browser; Wi-Fi and pool credentials
and raw nested pool objects are excluded.
