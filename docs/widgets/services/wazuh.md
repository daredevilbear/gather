---
title: Wazuh
description: Wazuh Widget Configuration
---

Connects directly from Gather to the Wazuh manager API (normally port 55000).
Use a dedicated API user with `agent:read` access to the agents you want counted.
Gather obtains and renews the authentication token automatically. Credentials stay server-side.

Allowed fields: `["total", "active", "disconnected", "pending", "never_connected"]`.

```yaml
widget:
  type: wazuh
  url: https://wazuh.example.net:55000
  username: {{HOMEPAGE_VAR_WAZUH_USER}}
  password: {{HOMEPAGE_VAR_WAZUH_PASSWORD}}
  fields: ["total", "active", "disconnected", "never_connected"]
```

Counts come from `GET /agents/summary/status` and reflect the API account's visibility.
Point `url` at the manager API, not the dashboard or indexer. This widget does not query alert indices.
It uses Gather's standard HTTP proxy and its existing TLS behavior.

[Wazuh API authentication](https://documentation.wazuh.com/current/user-manual/api/getting-started.html)
