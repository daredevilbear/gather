# Encrypted single-file quickstart

Use `deploy/compose.quickstart.yaml` with a released app image containing
`/app/system/initialize-quickstart.cjs`. The manifest defaults to the tested 1.0.1 app, companion and controller digests.
Keep the shown `GATHER_IMAGE` in your private `.env` so the socket-group command
uses the same app. Original 1.0.0
and the dev digest `020c8556…` predate this command and cannot run this quickstart.
The companion, controller, gateway and broker are pinned independently in Compose.

Compose runs the image-owned initialization command once, before the long-running app starts. That command creates encryption keys and initial encrypted records; normal app startup still fails closed if required keys or records are missing. This is not automatic initialization on every app boot. The gateway and broker provisioning configuration is inline in Compose, so no setup ZIP or separately downloaded initializer is required. Operator inputs and persistent state are still required.

Copy only `deploy/compose.quickstart.yaml` into a fresh private installation directory as `compose.yaml`. Supply first-use inputs through a mode-0600 `.env`:

```dotenv
GATHER_PROJECT=gather-encrypted
GATHER_IMAGE=ghcr.io/daredevilbear/gather@sha256:79325ebb91823898eb0737d767b615473dcecaee348b0769c165eae456ae8dbd
GATHER_DOMAIN=your-gather-hostname
GATHER_OIDC_ISSUER=https://your-identity-provider
GATHER_OIDC_CLIENT_ID=your-client-id
GATHER_OIDC_CLIENT_SECRET=your-client-secret
GATHER_ADMIN_IDS=your-stable-oidc-subject
GATHER_SUBNET=an-unused-private-subnet-in-CIDR-notation
```

Use a real HTTPS hostname/provider accessible to the browser and containers. Register callback `https://your-gather-hostname/api/auth/callback/gather-oidc`. Discovery issuer and authorization/token/JWKS endpoints must satisfy System's same-origin HTTPS checks. Public Caddy certificate issuance also needs appropriate DNS and reachable ports 80/443. The audited Mac sample uses a separate loopback-only local-CA fixture. External DNS/ACME issuance and a real identity provider were not exercised by that fixture.

Detect the active Docker engine's socket group before Compose validates required inputs:

```sh
export GATHER_IMAGE=ghcr.io/daredevilbear/gather@sha256:79325ebb91823898eb0737d767b615473dcecaee348b0769c165eae456ae8dbd
export DOCKER_SOCKET_GID=$(docker run --rm --network none --user 0:0 --entrypoint sh \
  -v /var/run/docker.sock:/engine.sock:ro "$GATHER_IMAGE" \
  -c "stat -c '%g' /engine.sock")
docker compose --profile setup config --quiet
docker compose --profile setup run --rm --no-deps initialize
docker compose --profile setup run --rm --no-deps ntfy-initialize
docker compose up -d --wait --wait-timeout 240
```

Save the observed group in the private `.env` for subsequent invocations. These commands initialize the encrypted state and broker before mounting key files in long-running services. Initializer reruns retain complete state and refuse partial state; editing first-use inputs afterward does not update the encrypted record. Apply later connection changes through protected System settings and confirm after fresh sign-in, or allow recovery to roll back.

Initialization creates distinct app/notification keys, encrypted app/notification/control databases, dashboard storage and distinct topic-scoped reader/publisher credentials. The first-use client secret remains plaintext in `.env` and helper container environment metadata visible to Docker operators even though persisted system records are encrypted. Protect and retire seed input appropriately after provisioning; the current manifest's required interpolation means subsequent commands still need those values, a limitation to improve with a future dedicated secret-input CLI. Do not describe vault encryption as hiding first-use inputs from the host operator.

The Docker socket grants the controller substantial engine control. Only use this manifest's unique named containers and the documented controller targets; do not point it at existing deployments. Choose a subnet that does not overlap Docker, LAN or VPN ranges. Keep state private, back up matching keys and databases together, and retain Caddy volumes for certificate continuity.

`sh scripts/ci/smoke-container.sh <image>` checks fresh encrypted boot, idempotence, schema/integrity, key permissions, wrong-key rejection and partial-state refusal. `sh scripts/ci/test-quickstart.sh <image> [absolute-manifest-path]` tests the exact manifest in a fresh private directory with host ports removed, all five services and verified HTTPS. It preserves state and removes only its own containers/network. Choose an unused test subnet through `GATHER_STANDALONE_SUBNET` when necessary. OS push and physical-device badges remain separately unverified.
