---
title: Bitaxe
description: Bitaxe / AxeOS miner widget configuration
setup_url: https://github.com/daredevilbear/gather/blob/dev/docs/widgets/services/bitaxe.md
---

Select **Bitaxe** in Gather's integration library and enter your miner's base URL.
Create one service per miner; use the service name and link for its title and AxeOS dashboard.
Gather must be able to reach the miner on your network. No API key is required.

```yaml
widget:
  type: bitaxe
  url: http://192.168.8.59
```

The card refreshes every 10 seconds using the read-only `/api/system/info` endpoint.
It shows hash rate, ASIC and voltage-regulator temperatures, input voltage,
all-time and session best difficulty, hardware error percentage, pool response
latency, fan RPM and percentage, and the active primary or fallback pool.
The timestamp indicates the last successful server fetch. Missing or unsupported
readings show `N/A`; an unreachable miner uses Gather's standard error display.

Allowed fields: `["hashrate", "temperature", "voltage", "bestdifficulty", "errorrate", "poollatency", "fan", "sessionbest", "pool"]`.
All fields are displayed by default. The temperature field includes VR temperature.
Standard Gather `highlight` rules can color numeric readings; voltage rules use volts.

Input voltage is converted from millivolts to volts. Difficulty accepts both raw
numbers and formatted strings from older firmware. Compatible AxeOS-derived
firmware can use the same widget when it exposes these API fields and units.
Historical charts and alerts remain in the miner's dashboard.

NerdQaxe's nested fallback status is supported. Firmware that omits hardware
error percentage or share-response latency shows `N/A` for those fields; pool
ping RTT and rejected-share ratios are different measurements and are not
substituted for them.

API reference: [ESP-Miner API](https://github.com/bitaxeorg/ESP-Miner/blob/master/main/http_server/openapi.yaml).
