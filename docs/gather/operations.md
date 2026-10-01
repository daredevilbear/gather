# Operating Gather

Use this guide alongside [Setup](setup.md), [Containers](containers.md), and
[Secure system configuration](system.md). File paths below describe the
application's mounts; your host paths depend on your deployment.

## Components and persistence

| Component                  | Responsibility                                      | Persistent state                                        |
| -------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| Gather app                 | Dashboard, accounts, settings, integration requests | `/app/config`; optional encrypted system store          |
| Notification companion     | Inbox state, subscriptions, Web Push                | Writable `/data`; optional read-only notification vault |
| Recovery controller        | Applies and rolls back protected system changes     | System control store and fixed deployment targets       |
| Gateway / reverse proxy    | HTTPS entry point and same-origin routing           | Operator-managed proxy configuration                    |
| Identity provider and ntfy | Identity and notification message history           | Backed up separately by their operators                 |

The controller is optional. Protected UI connection changes require a healthy
controller; ordinary dashboard editing is a separate feature. See the
[controller boundary](system.md#recovery-controller) before deploying it.

## Upgrade procedure

1. Record the running app and companion image digests, controller image if used,
   configuration mounts, key mounts, and proxy configuration.
2. Review changes on the intended branch. `dev` is the development channel;
   `latest` tracks successful `main` builds. Prefer immutable image digests.
3. Finish any pending system-settings activation, then take a consistent backup
   as described below. Verify you have the matching encryption keys.
4. Validate the new images in an isolated instance with separate writable data,
   sign-in configuration, and push subscriptions.
5. Pull the chosen images using the deployment host's registry credentials and
   replace the intended containers through your deployment manager. Preserve
   persistent mounts, ownership, and key files.
6. Check application health, fresh login, administrator/viewer behavior, widgets,
   and notification routes. When push code changes, update the companion too and
   test delivery on an actual device.

A running old container does not prove that its replacement image can be pulled.
A successful GitHub build does not prove that a deployment host has registry
access. [Pull troubleshooting](troubleshooting.md#container-image-will-not-pull)
covers the distinction.

The supplied [gateway template](../../deploy/nginx-docker.conf) resolves Docker
upstreams dynamically. If a replacement produces 502 responses, follow
[Gateway recovery](containers.md#gateway-recovery-after-container-replacement).

## Backup inventory

The editor's **Backup & restore** manages configuration versions. It is not a
complete backup of users, subscriptions, encryption keys, or external services.
Include the whole persistent configuration directory, including hidden files.

| Data                                                     | Contents / restoration requirement                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Dashboard YAML, CSS, and JavaScript                      | Shared presentation, services, connections, and customization                                      |
| `config/.gather-icons`                                   | Uploaded icons                                                                                     |
| `config/.gather-backups`                                 | Saved configuration versions                                                                       |
| `config/.gather-runtime`                                 | Non-secret companion runtime preferences                                                           |
| `config/.gather-preferences.sqlite`                      | Account preferences                                                                                |
| `config/.gather-users.sqlite`                            | User records, roles, activity, and legacy layout records                                           |
| `config/.gather-workspaces.sqlite`                       | Personal documents, snapshots, sharing tokens, dashboard selections                                |
| `config/.gather-variables.sqlite`                        | Encrypted managed variables; requires the matching app key                                         |
| System `app/`, `notification/`, and `control/` databases | One coordinated transaction set; preserve all three together                                       |
| Companion `/data`                                        | Push database, subscriptions, account notification state, VAPID key                                |
| Encryption keys                                          | Store separately with controlled access; encrypted backups cannot replace lost keys                |
| Deployment configuration                                 | Mounts, environment configuration, proxy routing, trusted certificates, external secret references |

For a straightforward offline backup, stop app and companion writers and the
recovery controller, then copy the complete persistent directories and any SQLite
journal/sidecar files as a consistent set. Resume services after the copy. Avoid
copying live SQLite database files individually. The system databases specifically
require a coordinated snapshot or an offline backup of all three stores; see
[SQLite layout and migration](system.md#sqlite-layout-and-migration).

Keep backup contents and keys outside Git. Define retention for older configuration
copies; the editor displays the latest 50 copies per section but does not remove
all older files for you. Back up identity-provider data and ntfy history separately.

## Restoration and rollback

Test restoration on an isolated instance first. Use the recorded image versions,
restore the complete state and matching keys, restore ownership/mounts, and verify
login, account isolation, integrations, and personal dashboards. Preserve the
VAPID key with subscriptions; replacing it invalidates existing subscriptions.

For an individual dashboard edit, use the editor's versioned restore. For an
application rollback, check whether the older image can read the current data
format. If compatibility is uncertain, restore the pre-upgrade backup together
with the prior images. Do not combine a database from one backup with unrelated
keys or system records from another.

For a failed protected authentication change, use the controller's timed rollback
and [emergency recovery procedure](system.md#recovery-controller). Do not manually
rewrite active system records during a pending activation.

## Verify service health

Use `/api/healthcheck` through the expected host and route. Then test a fresh
sign-in and representative integrations; HTTP health alone cannot validate an
OIDC exchange, upstream credentials, or physical push delivery. Check gateway and
application logs around the failure time, keeping credentials and cookie values
out of reports. Record the deployed image revision with each incident.
