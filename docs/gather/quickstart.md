# Encrypted single-file quickstart

Use `deploy/compose.quickstart.yaml` with a released app image containing
`/app/system/initialize-quickstart.cjs`. The manifest defaults to the Gather 1.0.3 app, companion and controller version tags.
For repeatable installation, use the verified immutable image set in the 1.0.3
release notes through `GATHER_IMAGE`, `GATHER_NOTIFICATIONS_IMAGE` and
`GATHER_CONTROLLER_IMAGE`.
Keep the shown `GATHER_IMAGE` in your private `.env` so the socket-group command
uses the same app. Original 1.0.0
and the dev digest `020c8556…` predate this command and cannot run this quickstart.
The companion, controller, gateway and broker are pinned independently in Compose.

Compose runs the image-owned initialization command once, before the long-running app starts. That command creates encryption keys and initial encrypted records; normal app startup still fails closed if required keys or records are missing. This is not automatic initialization on every app boot. The gateway and broker provisioning configuration is inline in Compose, so no setup ZIP or separately downloaded initializer is required. Operator inputs and persistent state are still required.

Copy only `deploy/compose.quickstart.yaml` into a fresh private installation directory as `compose.yaml`. Supply first-use inputs through a mode-0600 `.env`:

```dotenv
GATHER_PROJECT=gather-encrypted
GATHER_IMAGE=ghcr.io/daredevilbear/gather:1.0.3
GATHER_DOMAIN=your-gather-hostname
GATHER_OIDC_ISSUER=https://your-identity-provider
GATHER_OIDC_CLIENT_ID=your-client-id
GATHER_OIDC_CLIENT_SECRET=your-client-secret
GATHER_ADMIN_IDS=your-stable-oidc-subject
GATHER_SUBNET=an-unused-private-subnet-in-CIDR-notation
```

### Local accounts instead of OIDC

Gather 1.0.3 includes the local-account initializer and the OIDC quickstart.
Use the same selected app image for both initialization and the dashboard.

Keep the hostname, project and subnet inputs. Omit all three `GATHER_OIDC_*`
credentials and `GATHER_ADMIN_IDS`, and supply:

```dotenv
GATHER_LOCAL_ADMIN_USERNAME=admin
GATHER_LOCAL_ADMIN_PASSWORD=your-unique-password-of-at-least-12-characters
```

There is no default password. Initialization creates one protected administrator;
Gather generates its stable identity and stores it in the encrypted administrator
allowlist. Passwords are individually salted scrypt hashes in
`config/.gather-users.sqlite`; the plaintext seed password is not persisted in the
vault or account database. First-use inputs in `.env` and helper container metadata
remain visible to Docker operators. Existing complete state is never reseeded by
editing these inputs or rerunning initialization.

After signing in, create individual usernames, passwords and roles in **Users &
access**. Users change their own password in **My preferences**. Administrators can
reset other users' passwords; changing or resetting a password invalidates existing
sessions. Five failed password attempts lock an account for one minute. Back up the
account database alongside the matching configuration and system keys.

Supplying all three OIDC credentials selects OIDC alone. Supplying only some is an
error, even if a local password was supplied. Existing explicitly configured
`GATHER_AUTH_PASSWORD` installations retain their single shared account; they do
not gain separate user identities automatically. Shared-password verification uses
salted scrypt, accepts 1–1024 characters, and permits at most two concurrent checks
per app process. Excess concurrent attempts fail sign-in and may be retried. The
configured shared password remains in the environment or encrypted configuration;
individual local accounts are the preferred option for new installations.

For OIDC, use a real HTTPS hostname/provider accessible to the browser and containers. Register callback `https://your-gather-hostname/api/auth/callback/gather-oidc` for OIDC. Discovery issuer and authorization/token/JWKS endpoints must satisfy System's same-origin HTTPS checks. Public Caddy certificate issuance also needs appropriate DNS and reachable ports 80/443. The audited Mac sample uses a separate loopback-only local-CA fixture. External DNS/ACME issuance and a real identity provider were not exercised by that fixture.

Detect the active Docker engine's socket group before Compose validates required inputs:

```sh
# Set GATHER_IMAGE to the same app image selected in your .env.
export GATHER_IMAGE=ghcr.io/daredevilbear/gather:1.0.3
export DOCKER_SOCKET_GID=$(docker run --rm --network none --user 0:0 --entrypoint sh \
  -v /var/run/docker.sock:/engine.sock:ro "$GATHER_IMAGE" \
  -c "stat -c '%g' /engine.sock")
docker compose --profile setup config --quiet
docker compose --profile setup run --rm --no-deps initialize
docker compose --profile setup run --rm --no-deps ntfy-initialize
docker compose up -d --wait --wait-timeout 240
```

Save the observed group in the private `.env` for subsequent invocations. These commands initialize the encrypted state and broker before mounting key files in long-running services. Initializer reruns retain complete state and refuse partial state; editing first-use inputs afterward does not update the encrypted record. Apply later connection changes through protected System settings and confirm after fresh sign-in, or allow recovery to roll back.

Initialization creates distinct app/notification keys, encrypted app/notification/control databases, dashboard storage and distinct topic-scoped reader/publisher credentials. The first-use OIDC client secret or local administrator password remains plaintext in `.env` and helper container environment metadata visible to Docker operators even though persisted system records are encrypted. Protect and retire seed input appropriately after provisioning; After successful initialization, ordinary start commands no longer require seed credentials; retain a private backup if you need to rerun the initializer. Do not describe vault encryption as hiding first-use inputs from the host operator.

The Docker socket grants the controller substantial engine control. Only use this manifest's unique named containers and the documented controller targets; do not point it at existing deployments. Choose a subnet that does not overlap Docker, LAN or VPN ranges. Keep state private, back up matching keys and databases together, and retain Caddy volumes for certificate continuity.

`sh scripts/ci/smoke-container.sh <image>` checks fresh encrypted boot, idempotence, schema/integrity, key permissions, wrong-key rejection and partial-state refusal. `sh scripts/ci/test-quickstart.sh <image> [absolute-manifest-path]` tests the exact manifest in a fresh private directory with host ports removed, all five services and verified HTTPS. It preserves state and removes only its own containers/network. Choose an unused test subnet through `GATHER_STANDALONE_SUBNET` when necessary. OS push and physical-device badges remain separately unverified.
