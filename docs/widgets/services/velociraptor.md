---
title: Velociraptor
description: Velociraptor Widget Configuration
---

Connects directly from Gather to Velociraptor's supported gRPC API using mutual TLS.
No bridge, log analyzer, GUI login, or REST gateway is required.

Allowed fields: `["total", "recent", "stale"]`.
`recent` counts clients seen within the last 15 minutes; `stale` counts the remainder.
These are last-seen counts, not a guarantee that a client has an open connection.

Create a dedicated API client identity with `ANY_QUERY` and `READ_RESULTS` permissions using the
[Velociraptor API setup instructions](https://docs.velociraptor.app/docs/server_automation/server_api/).
Mount its generated API client YAML file read-only into the Gather container, for example
`./velociraptor-api.yaml:/app/config/velociraptor-api.yaml:ro`.
The file contains `api_connection_string`, `ca_certificate`, `client_cert`, and
`client_private_key`; keep it private. The path and certificate material remain server-side.

```yaml
widget:
  type: velociraptor
  apiConfig: /app/config/velociraptor-api.yaml
  # orgId: O.example # Optional; defaults to the root organization
```

The API address in that file must be reachable from Gather (typically port 8001).
Velociraptor normally binds its API to loopback; configure private network access as needed.
Gather verifies the server against the file's CA and the `VelociraptorServer` certificate name,
matching Velociraptor's reference API client. The service card's `href` can still point at the GUI.

Gather runs only a fixed `clients()` query and returns counts to the browser. It streams all
client batches without a pagination limit, with a 20-second request deadline. Permission,
connection, or malformed response errors appear as widget errors rather than zero counts.
