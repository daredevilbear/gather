# Gather

[![Dashboard image downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fdaredevilbear%2Fgather&query=downloadCount&label=dashboard%20downloads&logo=docker)](https://github.com/daredevilbear/gather/pkgs/container/gather)
[![Notification image downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fdaredevilbear%2Fgather-notifications&query=downloadCount&label=notifications%20downloads&logo=docker)](https://github.com/daredevilbear/gather/pkgs/container/gather-notifications)
[![Controller image downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fghcr-badge.elias.eu.org%2Fapi%2Fdaredevilbear%2Fgather-system-controller&query=downloadCount&label=controller%20downloads&logo=docker)](https://github.com/daredevilbear/gather/pkgs/container/gather-system-controller)

Gather is a self-hosted dashboard with service integrations, visual configuration,
user accounts, personal dashboards, and notifications. It is based on
[Homepage](https://github.com/gethomepage/homepage), with native Gather features
built on the inherited dashboard and widget system.

**[Documentation](https://gather.daredevilbear.dev/gather/)** ·
[Install](INSTALL.md) · [Release notes](CHANGELOG.md) ·
[Migrate from Homepage](https://gather.daredevilbear.dev/gather/migration/) ·
[Troubleshooting](https://gather.daredevilbear.dev/gather/troubleshooting/)

## What Gather includes

- An application bar with search, tabs, account controls, and an inbox.
- Visual editors for appearance, layouts, services, bookmarks, Home widgets,
  custom styles, and configuration backup/restore.
- Named users and roles, account preferences, and personal dashboards with
  view-only sharing for signed-in Gather users.
- Encrypted integration variables and protected system configuration with
  supervised authentication rollback.
- An optional notification companion for account-scoped read/dismiss state,
  Web Push, and installed-app badges.
- Homepage-compatible integrations plus Gather additions, including vCenter,
  Bitcoin Node, Bitaxe, NerdAxe, Wazuh, and Velociraptor.

## Install 1.0

Gather 1.0.0 uses three independently deployable images, all built from the same
source revision for `linux/amd64` and `linux/arm64`:

| Image                                            | Purpose                                            | Release tag |
| ------------------------------------------------ | -------------------------------------------------- | ----------- |
| `ghcr.io/daredevilbear/gather`                   | Dashboard                                          | `1.0.0`     |
| `ghcr.io/daredevilbear/gather-notifications`     | Optional inbox and Web Push companion              | `1.0.0`     |
| `ghcr.io/daredevilbear/gather-system-controller` | Optional recovery controller with Docker authority | `1.0.0`     |

Follow [INSTALL.md](INSTALL.md) for a complete dashboard example with persistent
configuration, authentication, and HTTPS proxy requirements. Enable the optional
components only after reviewing their separate configuration and permissions.
Use the immutable image digests recorded in the release notes for repeatable
installs. `latest` follows `main`; `dev` follows development on `dev`.

Download badges show GitHub's cumulative download count for each public GHCR
package through the [ghcr-badge service](https://github.com/eliasbenb/ghcr-badge).
They count downloads across tags and architectures, including automated pulls;
they do not count unique users. Counts can be cached or unavailable, and appear
only when the packages are publicly readable. No deployment credentials are used.

## Documentation and support

The [Gather website](https://gather.daredevilbear.dev/) is public and provides the
current documentation. Compare its release baseline with your deployed image.
Documentation contributions belong in the separate
[gather-docs repository](https://github.com/daredevilbear/gather-docs).
The inherited `docs/` tree is a source snapshot; it is not separately maintained.

| Task                                                      | Guide                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Install and configure authentication                      | [Installation](INSTALL.md) and [Setup](https://gather.daredevilbear.dev/gather/setup/) |
| Choose images and release channels                        | [Containers](https://gather.daredevilbear.dev/gather/containers/)                      |
| Edit a shared dashboard                                   | [Settings](https://gather.daredevilbear.dev/gather/settings/)                          |
| Manage users, personal dashboards, secrets, and migration | [Administration](https://gather.daredevilbear.dev/gather/administration/)              |
| Configure inbox and push delivery                         | [Notifications](https://gather.daredevilbear.dev/gather/notifications/)                |
| Configure encrypted connections and recovery              | [System settings](https://gather.daredevilbear.dev/gather/system/)                     |
| Upgrade, back up, and restore                             | [Operations](https://gather.daredevilbear.dev/gather/operations/)                      |
| Configure integrations                                    | [Widget reference](https://gather.daredevilbear.dev/widgets/services/)                 |

Report bugs and feature requests in [Gather Issues](https://github.com/daredevilbear/gather/issues).
For confidential reports, see [SECURITY.md](SECURITY.md).

## Development

Use Node.js 22.13 or newer and pnpm 11.19.0:

```sh
pnpm install --frozen-lockfile
pnpm dev:preview
```

Open [the settings preview](http://127.0.0.1:3022/preview/settings). It uses isolated
sample data and refreshes as source changes. See
[Local interface preview](https://gather.daredevilbear.dev/gather/local-preview/)
for its limits. OIDC sign-in, service connections, and device push need separate
integration checks. Follow [CONTRIBUTING.md](CONTRIBUTING.md) for CI commands.

Development targets `dev`. Releases merge `dev` into `main` and use annotated
`vMAJOR.MINOR.PATCH` tags. CI publishes containers after validation; it never
changes deployment infrastructure. See [RELEASING.md](RELEASING.md).

## License and upstream

Gather retains Homepage's [GPL-3.0 license](LICENSE), contributor history, and
upstream notices. The initial baseline is Homepage v2.4.0, independent of Gather's
1.0.0 release version. See [NOTICE](NOTICE) and the preserved
[upstream README](README.upstream.md). Dependencies retain their own licenses.

## Configuration migration

The next Gather build uses Gather names throughout the code and runtime
configuration. Existing private installations must migrate before upgrading;
legacy configuration aliases and the old SSO callback are removed.

1. Stop the dashboard, notifications and controller. Back up configuration,
   databases, notification data and encryption keys using the offline procedure
   in [Operations](https://gather.daredevilbear.dev/gather/operations/).
2. From the new source checkout, preview the environment-prefix migration with
   Node.js 22.13 or newer. Use your actual configuration and `.env` paths:

   ```sh
   node scripts/migrate-config-prefix.cjs --from-prefix HOMEPAGE_ \
     --config-dir /path/to/config --env-file /path/to/.env
   ```

   If encrypted variables or system settings exist, add
   `--app-key-file /path/to/gather-app-key`; for system settings also add
   `--system-dir /path/to/system-data`. The helper migrates YAML placeholders,
   `.env` keys, encrypted variables, personal dashboard placeholders and both
   active and rollback app vault records. It re-encrypts variables with their
   new names, selects the Gather callback, preserves secret values and access
   identities, and rejects collisions.
   Preview changes no files. To apply, repeat with `--apply` and
   `--backup-dir /path/to/new-private-backup` outside the migrated directories.
   Keep the backup and original keys. If applying fails, restore every file
   listed in its `manifest.json`, removing current SQLite `-wal`/`-shm` files
   and restoring their saved copies if present,
   before restarting any component. Never run the helper against live writers.
3. Update your Compose environment keys from `HOMEPAGE_*` to `GATHER_*` too;
   renaming `.env` keys alone does not change keys declared inside Compose.
   Rename `homepage.*` discovery labels to `gather.*`, and
   `gethomepage.dev/*` Kubernetes annotations to `gather.daredevilbear.dev/*`.
   Update external placeholders to `GATHER_VAR_*` / `GATHER_FILE_*`, MCP resource
   URIs to `gather://config/`, the documentation tool to `gather_docs`, and custom
   token headers to `x-gather-mcp-token`.
4. Register `/api/auth/callback/gather-oidc` at the identity provider and set
   `GATHER_OIDC_PROVIDER_ID=gather-oidc`. Remove any old callback selection.
   Start a fresh sign-in flow after the upgrade. OIDC subjects remain unchanged.
   For an existing shared-password account, set
   `GATHER_PASSWORD_USER_ID=homepage` and retain its existing `GATHER_ADMIN_IDS`
   value to preserve access and its personal dashboard. New installations use
   the `gather` identity. This value is operator configuration, not a built-in
   legacy alias.
5. Start the upgraded components together, refresh installed apps to update the
   notification worker, and verify administrator/viewer access, service
   discovery, variables and notifications. Custom notification senders must use
   `GATHER_OPEN_NOTIFICATION`; the previous event name is removed.

Help links in the application and MCP now use
[Gather documentation](https://gather.daredevilbear.dev/).
