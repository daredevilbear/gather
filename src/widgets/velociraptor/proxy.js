import { readFile } from "node:fs/promises";

import { load } from "js-yaml";

import { createClient, queryClients } from "./api";

import getServiceWidget from "utils/config/service-helpers";

export default async function velociraptorProxyHandler(req, res) {
  const { group, service, index, endpoint } = req.query;
  if (!group || !service || endpoint !== "clients") {
    return res.status(400).json({ error: "Invalid Velociraptor endpoint" });
  }
  const widget = await getServiceWidget(group, service, index);
  if (widget?.type !== "velociraptor" || typeof widget.apiConfig !== "string") {
    return res.status(400).json({ error: "Velociraptor requires an apiConfig file path" });
  }
  let client;
  try {
    const config = load(await readFile(widget.apiConfig, "utf8"));
    for (const key of ["api_connection_string", "ca_certificate", "client_private_key", "client_cert"]) {
      if (typeof config?.[key] !== "string" || !config[key]) throw new Error("Invalid API config");
    }
    client = createClient(config);
    const summary = await queryClients(client, widget.orgId ?? "");
    return res.status(200).json(summary);
  } catch {
    return res.status(502).json({
      error:
        "Unable to retrieve Velociraptor clients. Check API connectivity, certificates and READ_RESULTS permission.",
    });
  } finally {
    client?.close();
  }
}
