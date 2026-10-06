import { minerAddress, queryMiner } from "./client";
import { minerTelemetry } from "./metrics";

import getServiceWidget from "utils/config/service-helpers";

export default async function avalonNano3sProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;
  if (!group || !service || endpoint !== "info") {
    return res.status(400).json({ error: "Invalid Avalon Nano 3s endpoint" });
  }
  const widget = await getServiceWidget(group, service, index);
  if (widget?.type !== "avalonnano3s" || !widget.url) {
    return res.status(400).json({ error: "Avalon Nano 3s requires a miner URL" });
  }
  try {
    const address = minerAddress(widget);
    const [summary, stats] = await Promise.all([queryMiner(address, "summary"), queryMiner(address, "estats")]);
    return res.status(200).json(minerTelemetry(summary, stats));
  } catch {
    // Upstream responses and device configuration never reach the browser.
    return res
      .status(502)
      .json({
        error: "Unable to retrieve Nano 3s telemetry. Check the miner address and TCP API port (default 4028).",
      });
  }
}
