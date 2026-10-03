# Gather setup guide

Gather is in active development. Start with an isolated instance and verify sign-in,
configuration recovery and integrations before replacing an existing dashboard.

## 1. Choose a runtime

Use the dashboard image described in [Container builds](containers.md). The `dev`
channel follows development; pin an immutable digest when you need a repeatable
installation. Private GHCR images require pull access on the deployment host.
The notification companion is a separate image. Publishing images does not deploy them.

For source development, use Node 22.13 or newer, install dependencies with
`pnpm install --frozen-lockfile`, then run `pnpm dev:preview`. See
[Local interface preview](local-preview.md). `/preview/settings` and
`/preview/dashboard` are development-only samples, not connected to live accounts.

## 2. Initialize an encrypted installation

The app image supplies `node /app/system/initialize-quickstart.cjs`. Run it once
against a fresh private installation directory before starting the app. It creates
distinct 32-byte app and companion keys, encrypted schema-1 SQLite records, initial
dashboard files and topic-scoped broker credentials. Normal app startup only reads
existing records and fails closed if required keys or records cannot be unlocked.
Rerunning initialization retains complete state and refuses partial state; preserve
failed directories for diagnosis rather than overwriting their keys or records.

The complete installation manifest is `deploy/compose.quickstart.yaml`. Gateway
configuration and the pinned broker's provisioning command are inline in Compose,
so no setup ZIP, downloaded initializer or separate Caddyfile is required. The
manifest requires an app image containing the initialization command; older images
cannot run it. See [Encrypted single-file quickstart](quickstart.md) and release evidence for
compatible image digests and the manifest checksum. Do not treat a documentation revision as
an image tag unless that image has actually been published.

First-use inputs include an HTTPS hostname and your choice of sign-in method.
With all three OIDC settings empty, supply `GATHER_LOCAL_ADMIN_USERNAME` (default
`admin`) and `GATHER_LOCAL_ADMIN_PASSWORD` (12–1024 characters). Initialization
creates a protected local administrator with a generated stable identity. No default
password or public registration is provided. Additional local accounts are created
in Users & access; users change their passwords in My preferences. Passwords are
stored as individually salted scrypt hashes in `config/.gather-users.sqlite`.

For OIDC, supply issuer/client ID/client secret and bootstrap administrator subjects.
Complete OIDC settings take precedence over local login; partial OIDC configuration
is rejected rather than falling back. Register
`https://<hostname>/api/auth/callback/gather-oidc` with the identity provider. OIDC
discovery and its authorization, token and JWKS endpoints must satisfy System's
HTTPS and same-origin checks. Generated system credentials are encrypted, but
first-use secrets in `.env` or helper container environment metadata remain visible
to Docker operators. Keep inputs private and back up matching keys and databases.

For macOS, use Docker Desktop's Linux engine and detect the engine socket's group
inside a container before Compose validates `DOCKER_SOCKET_GID`; the Mac file's
group is not the engine's group. Choose an unused Docker subnet and use a fresh
project name and directory. A local generated CA needs deliberate browser trust;
remove temporary trust after testing. Keep TLS verification and authentication on.

The recovery controller mounts the Docker socket and targets only this project's
explicitly named containers. Its socket remains a privileged boundary. The web
app has no socket access. See [Secure system configuration](system.md) for mounts,
confirmed changes, rollback and coordinated backups.

## 3. Configure Gather

After signing in as a bootstrap administrator, open the account menu → Dashboard
settings. Set appearance, create tabs, then assign layout groups to those tabs.
Add services, bookmarks and Home widgets using the guided pickers. Source remains
available for advanced configuration. See [Settings editor](settings.md).

For an existing Homepage installation, follow the reviewable
[Homepage migration steps](administration.md#homepage-migration).
For managed secrets, mount the 32-byte app key and follow
[Secrets and variables](administration.md#secrets-and-variables).

With local sign-in, use Users & access to create accounts with separate usernames,
passwords and roles, disable access or reset a user's password. A reset invalidates
that account's existing sessions. With OIDC, Users & access prepares named roles
for existing identity-provider users; it does not create provider accounts.
Neither method sends invitations. My dashboard provides
private links and tabs; shared integration widgets retain their existing scope.
See [Users, roles and personal dashboards](administration.md#users-roles-and-personal-dashboards).

## 4. Enable and verify notifications

Follow [Notifications](notifications.md) to configure the companion, authenticated
same-origin routing, topic access and persistent push data. Open the inbox, enable
push on a supported device and send a test. Check full-page navigation and the
unread badge on the actual installed app. Browser previews cannot verify OS delivery.

## 5. Verify and back up

Before relying on the instance, verify administrator and viewer access, a private
dashboard with two separate users, service connections, imports and recovery.
Review keyboard navigation and readable contrast at the screen sizes you use.

Back up dashboard YAML, uploaded icons, account preference/user/variable databases
and companion data. Backup & restore in the editor covers configuration files;
it is not a complete instance backup. Preserve encryption keys separately and
follow the coordinated offline backup procedure for system databases in
[Secure system configuration](system.md). Test restoration on an isolated instance.

Gather callback support requires a build containing the OIDC rename and
`GATHER_OIDC_PROVIDER_ID=gather-oidc`. Older builds and existing deployments without
this selection use `/api/auth/callback/homepage-oidc`. Register the new callback at
the identity provider before switching; both routes remain supported by new builds.
