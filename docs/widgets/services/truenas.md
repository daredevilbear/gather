---
title: TrueNas
description: TrueNas Scale Widget Configuration
---

Learn more about [TrueNas](https://www.truenas.com/).

| TrueNAS Version         | Homepage widget version |
| ----------------------- | ----------------------- |
| < 26.04 (REST API)      | 1 (default)             |
| > 25.04 (Websocket API) | 2                       |

Version 2 uses TLS for both API-key and password authentication and verifies the
server certificate. Use an HTTPS URL whose hostname matches the certificate.
For a private CA, mount its PEM certificate read-only into the Gather app container
and set `NODE_EXTRA_CA_CERTS` to that file's path before starting the container.
An untrusted, expired, or hostname-mismatched certificate causes the connection to
fail; certificate verification cannot be disabled by the widget.

Allowed fields: `["load", "uptime", "alerts"]`.

To create an API Key, follow [the official TrueNAS documentation](https://www.truenas.com/docs/scale/scaletutorials/toptoolbar/managingapikeys/).

A detailed pool listing is disabled by default, but can be enabled with the `enablePools` option.

To use the `enablePools` option with TrueNAS Core, the `nasType` parameter is required.

```yaml
widget:
  type: truenas
  url: https://truenas.host.or.ip
  version: 2 # optional, defaults to 1
  username: user # not required if using api key
  password: pass # not required if using api key
  key: yourtruenasapikey # not required if using username / password
  enablePools: true # optional, defaults to false
  nasType: scale # defaults to scale, must be set to 'core' if using enablePools with TrueNAS Core
```
