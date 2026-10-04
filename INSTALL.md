# Install Gather 1.0.3

Use Docker Engine with the Docker Compose plugin on `linux/amd64` or
`linux/arm64`. Runtime configuration uses `GATHER_*` environment names.
Existing installations must follow the [configuration migration](README.md#configuration-migration) before upgrading to this build.

## Separate local accounts or OIDC

The [encrypted Compose setup](https://gather.daredevilbear.dev/gather/setup/)
initializes a protected administrator and the complete dashboard, notification
and recovery stack. With all three OIDC settings absent, supply
`GATHER_LOCAL_ADMIN_USERNAME` (default `admin`) and a unique
`GATHER_LOCAL_ADMIN_PASSWORD` of 12–1024 characters. There is no default password.
Additional local accounts are created in Users & access; users change their own
passwords in My preferences. Credentials use individually salted scrypt hashes in
`config/.gather-users.sqlite`; include it in full backups.

Complete OIDC configuration selects OIDC alone; partial configuration is rejected.
Existing shared-password accounts remain supported. Shared-password verification
uses salted scrypt, accepts 1–1024 characters, and allows two concurrent checks
per app process; excess concurrent attempts fail and may be retried. Changing from
local accounts to OIDC requires an operator migration and restart, and does not transfer roles
or dashboards between identities. Editing seed inputs does not change an existing
installation. See [System settings](https://gather.daredevilbear.dev/gather/system/#adding-oidc-after-local-setup).

## Dashboard with shared-password authentication

Use the `v1.0.3` source checkout with the `1.0.3` images, or pin the immutable
digests recorded in the release notes. The example selects `1.0.3` by default.
From the repository root:

```sh
cp .env.example .env
chmod 600 .env
mkdir -p config
# Linux bind mounts must be writable by the image's unprivileged UID/GID.
sudo chown 1001:1001 config
openssl rand -base64 32  # use this as GATHER_AUTH_SECRET
openssl rand -base64 32  # use a different value as GATHER_AUTH_PASSWORD
```

Edit `.env` with the two generated secrets, your external HTTPS origin and exact
hostname. The sample uses password authentication with the shared `gather`
identity; `GATHER_ADMIN_IDS=gather` grants that identity administrator access.
For distinct users, use the encrypted local-account setup or OIDC as described below.

```sh
docker compose --env-file .env -f deploy/compose.example.yaml config --quiet
docker compose --env-file .env -f deploy/compose.example.yaml pull
docker compose --env-file .env -f deploy/compose.example.yaml up -d
```

The example binds port 3000 to loopback only. Configure your own HTTPS reverse
proxy to forward your external hostname to `http://127.0.0.1:3000`, preserving
`Host`, `X-Forwarded-Host` and `X-Forwarded-Proto`. A proxy in another container
needs a shared private Docker network instead of host loopback. Keep its routing
restricted to the dashboard. This repository does not configure DNS, tunnels,
certificates, or your proxy infrastructure.

Open your external URL and sign in. Use Dashboard settings to configure the
shared dashboard. Configuration and account databases persist in `config/`.
The example does not mount a Docker socket or enable the privileged controller.
The public release images can be pulled anonymously; no GitHub credentials are
needed for installation.

## OIDC and multiple users

Set `GATHER_OIDC_ISSUER`, `GATHER_OIDC_CLIENT_ID`, and
`GATHER_OIDC_CLIENT_SECRET` in `.env`, keep the session secret, clear the password,
and set `GATHER_ADMIN_IDS` to your administrator's stable provider subject. OIDC
configuration selects SSO instead of password login. Set
`GATHER_OIDC_PROVIDER_ID=gather-oidc` and register:

```text
https://gather.example.com/api/auth/callback/gather-oidc
```

Replace the sample hostname with yours. Gather uses this callback by default;
`GATHER_OIDC_PROVIDER_ID`, if set, must be `gather-oidc`. Register the callback at
your identity provider before upgrading, then start a fresh sign-in flow. The
example Compose forwards the callback selection from `.env`.

Use verified email claims and distinct
subjects. Users & access manages Gather roles and personal dashboards; it does
not create identity-provider accounts. Validate administrator and viewer access
before adopting the instance. See [Setup](https://gather.daredevilbear.dev/gather/setup/).

## Optional components

The dashboard runs without either companion. To enable the inbox and Web Push,
use `ghcr.io/daredevilbear/gather-notifications:1.0.3` and follow
[Notifications](https://gather.daredevilbear.dev/gather/notifications/) for ntfy,
authenticated same-origin `/gather-notifications/` routing, session lookup,
origin validation, and a writable `/data` volume for its unprivileged UID 1001.
Web Push requires HTTPS and a supported installed app/device. The generic
[nginx routing template](deploy/nginx-docker.conf) is for a separate private
network containing services named `gather` and `notifications`; it is not a
complete HTTPS deployment.

For encrypted integration variables, mount a separately generated 32-byte app
key at `/run/secrets/gather-app-key` and follow
[Administration](https://gather.daredevilbear.dev/gather/administration/).
For encrypted system settings and supervised authentication rollback, follow
[System settings](https://gather.daredevilbear.dev/gather/system/), including
separate keys, `/system-data` persistence, and the optional controller's authority.
Use `ghcr.io/daredevilbear/gather-system-controller:1.0.3`; review
[the controller example](system/compose-controller.example.yaml) before mounting
a Docker socket. These components require operator configuration and are not
started by the dashboard example.

## Upgrades, source builds, and backups

Gather 1.0.3 includes the [security fixes and compatibility notes](CHANGELOG.md#103).
Upgrade the app and enabled companions together; existing encrypted state and
local/OIDC accounts do not need reinitialization. TrueNAS v2 now requires HTTPS
and verified TLS. Use a certificate matching its configured hostname; for a
private CA, mount the PEM CA file read-only and set `NODE_EXTRA_CA_CERTS` to its
container path before starting the app. Do not disable certificate verification.
Review configured shared passwords against the limits above.

Pin the three image digests listed in the release notes for repeatability. The
`latest` channel follows released `main`; `dev` follows development. A version tag
is immutable, and `sha-<full commit SHA>` identifies the source revision.

Back up `config/`, account/variable/system SQLite databases, uploaded icons,
notification `/data`, and keys using the coordinated offline procedure in
[Operations](https://gather.daredevilbear.dev/gather/operations/). The editor's
configuration export does not include every database or encryption key. Test
restoration in an isolated instance before upgrading. Roll back the image and
its matching state backup together when a state migration requires it.

For a local source build, run `docker build -t gather:review .` from the release
checkout and set the example's image to `gather:review`. Build optional companions
with `docker build -t gather-notifications:dev notifications` and
`docker build -t gather-system-controller:dev system`. Source development uses
Node.js 22.13 or newer and pnpm 11.19.0; see [CONTRIBUTING.md](CONTRIBUTING.md).
