import { createHash } from "node:crypto";

import cache from "memory-cache";

import getServiceWidget from "utils/config/service-helpers";
import { httpProxy } from "utils/proxy/http";

const fields = ["total", "active", "disconnected", "pending", "never_connected"];

export default async function wazuhProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;
  if (!group || !service || endpoint !== "agents/summary/status") {
    return res.status(400).json({ error: "Invalid Wazuh endpoint" });
  }
  const widget = await getServiceWidget(group, service, index);
  if (widget?.type !== "wazuh" || !widget.url || !widget.username || !widget.password) {
    return res.status(400).json({ error: "Wazuh requires a URL, username and password" });
  }
  // Include credentials and widget identity so changes cannot reuse another session.
  const key = `wazuh:${createHash("sha256")
    .update(JSON.stringify([group, service, index, widget.url, widget.username, widget.password]))
    .digest("hex")}`;
  const base = widget.url.replace(/\/+$/, "");
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let token = cache.get(key);
      if (!token) {
        const [status, , body] = await httpProxy(`${base}/security/user/authenticate`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${widget.username}:${widget.password}`).toString("base64")}`,
          },
        });
        if (status !== 200) throw new Error("Authentication failed");
        token = JSON.parse(body).data?.token;
        if (typeof token !== "string" || !token) throw new Error("Invalid token");
        cache.put(key, token, 60_000);
      }
      const [status, , body] = await httpProxy(`${base}/agents/summary/status`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (status === 401) {
        cache.del(key);
        continue;
      }
      if (status !== 200) throw new Error("Summary request failed");
      const payload = JSON.parse(body);
      const summary = payload.data?.connection ?? payload.data;
      if (payload.error || !fields.every((field) => Number.isSafeInteger(summary?.[field]) && summary[field] >= 0)) {
        throw new Error("Invalid summary");
      }
      return res.status(200).json(Object.fromEntries(fields.map((field) => [field, summary[field]])));
    }
  } catch {
    cache.del(key);
  }
  // Never forward upstream bodies or credentials to the browser.
  return res
    .status(502)
    .json({ error: "Unable to retrieve Wazuh agent status. Check connectivity and API credentials." });
}
