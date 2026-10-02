# Install Gather 1.0

Use Docker Engine with the Docker Compose plugin on `linux/amd64` or
`linux/arm64`. Runtime configuration uses `GATHER_*` environment names.
Existing installations must follow the [configuration migration](README.md#configuration-migration) before upgrading to this build.

## Dashboard with authentication

Use the source revision matching your selected image. During private review,
the Gather naming cleanup uses `dev`; the older private `v1.0.0` candidate
predates these environment names. Pin the new release version or digest once
it is prepared. From the repository root:

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
For distinct users, use OIDC as described below.

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
Anonymous local pulls work after the release packages are public; during private
release review, use a GitHub account with package access or build from source.

## OIDC and multiple users

Set `GATHER_OIDC_ISSUER`, `GATHER_OIDC_CLIENT_ID`, and
`GATHER_OIDC_CLIENT_SECRET` in `.env`, keep the session secret, clear the password,
and set `GATHER_ADMIN_IDS` to your administrator's stable provider subject. OIDC
configuration selects SSO instead of password login. With a build supporting the Gather
callback, set `GATHER_OIDC_PROVIDER_ID=gather-oidc` and register:

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
use `ghcr.io/daredevilbear/gather-notifications:dev` and follow
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
Use `ghcr.io/daredevilbear/gather-system-controller:dev`; review
[the controller example](system/compose-controller.example.yaml) before mounting
a Docker socket. These components require operator configuration and are not
started by the dashboard example.

## Upgrades, source builds, and backups

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
