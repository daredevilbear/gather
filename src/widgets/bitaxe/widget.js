import { asJson } from "utils/proxy/api-helpers";
import genericProxyHandler from "utils/proxy/handlers/generic";

// Only send card telemetry to the browser, not Wi-Fi or pool credentials.
const telemetry = [
  "hashRate",
  "temp",
  "vrTemp",
  "voltage",
  "bestDiff",
  "bestSessionDiff",
  "errorPercentage",
  "responseTime",
  "fanrpm",
  "fanspeed",
  "stratumURL",
  "stratumPort",
  "fallbackStratumURL",
  "fallbackStratumPort",
  "isUsingFallbackStratum",
];

const widget = {
  api: "{url}/api/{endpoint}",
  proxyHandler: genericProxyHandler,
  mappings: {
    info: {
      endpoint: "system/info",
      map: (raw) => {
        const data = asJson(raw);
        return {
          ...Object.fromEntries(telemetry.map((key) => [key, data[key]])),
          isUsingFallbackStratum: data.isUsingFallbackStratum ?? data.stratum?.usingFallback,
          updatedAt: Date.now(),
        };
      },
    },
  },
};

export default widget;
