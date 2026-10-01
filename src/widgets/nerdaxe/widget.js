import { numeric } from "../bitaxe/metrics";
import bitaxe from "../bitaxe/widget";

import { asJson } from "utils/proxy/api-helpers";

const widget = {
  ...bitaxe,
  mappings: {
    info: {
      endpoint: "system/info",
      map: (raw) => {
        const data = asJson(raw);
        const pools = Array.isArray(data.stratum?.pools) ? data.stratum.pools : [];
        const connected = pools.filter((pool) => pool?.connected === true);
        // The legacy field also supports firmware without per-pool telemetry.
        // With multiple connected pools, use the device's aggregate reading.
        const pingRtt =
          pools.length && !connected.length
            ? null
            : ((connected.length === 1 ? numeric(connected[0].pingRtt) : null) ?? numeric(data.lastpingrtt));
        const accepted = numeric(data.sharesAccepted);
        const rejected = numeric(data.sharesRejected);
        const total = accepted === null || rejected === null ? 0 : accepted + rejected;

        return {
          ...bitaxe.mappings.info.map(data),
          pingRtt,
          rejectedSharePercentage: total > 0 ? (rejected / total) * 100 : null,
        };
      },
    },
  },
};

export default widget;
