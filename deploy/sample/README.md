# Optional populated Mac fixture

This optional test fixture is separate from the single-file supported installation.
It needs Docker Desktop's Linux engine, loopback port 8443 and unused subnet
172.16.240.0/24. Check for conflicts before starting. It uses fictional accounts,
mock OIDC and authored Custom API responses, and is unsuitable for public deployment.
Custom API fixtures do not prove native provider compatibility.

From this directory, run `sh create-lab.sh`. Change into the fresh private directory
printed by that command, export `GATHER_IMAGE` as the compatible released app digest,
and run `sh setup-mac.sh`. The script starts only its unique lab project. It keeps
both encrypted vaults, authentication and verified TLS. It exports a public local-CA
certificate but does not change macOS trust. Deliberate browser trust is needed for
UI testing; remove temporary trust afterward. API clients can use its exact CA file.

Alex/demo-admin is the protected administrator. Morgan and Sam are viewers. The
sample contains four tabs, eight groups, 19 cards, 18 service widgets, four Home
widgets and four bookmarks. Two Calendar widgets and one IFrame use authored feeds
and pages; fifteen service widgets use Custom API, including one intentional 503.

Use `sh scripts/compose.sh down` to remove only this project's containers/network;
retain its keys, databases and Caddy volumes for diagnosis. Never use this fixture
to replace an existing deployment. The standard installation needs none of these
mock sources or populated YAML files and needs no ZIP.
