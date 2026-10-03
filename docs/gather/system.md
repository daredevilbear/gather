# Secure system configuration

Protected server administrators open **System settings** within Dashboard settings.
The compatibility route `/system` redirects to that section. Administrators added
through Users & access cannot change these protected connection settings.
The page manages OIDC issuer/client credentials, ntfy connection credentials and
administrator subject IDs. It never returns stored secret values. Blank secret
fields retain the current value; replacing a connection destination requires new
credentials. New ntfy destinations require HTTPS. Existing internal HTTP ntfy
connections can be retained. Tests reject redirects and verify OIDC discovery and
ntfy topic access. An OIDC client secret can only be fully verified by signing in.

## Storage and startup

System records in SQLite use AES-256-GCM with random 96-bit nonces and domain-specific
associated data. The app and notification companion use separate 256-bit keys.
The companion receives only its own record and key, not OIDC credentials.

The host provides these mounts (paths are examples):

- App: `/system-data` (encrypted records/control directory, writable).
- App: `/run/secrets/gather-app-key` and
  `/run/secrets/gather-notification-key` (32 raw bytes each, read-only).
- Companion: only `notification/` mounted read-only at `/vault`, plus its own key.

App configuration points to the store with `GATHER_SYSTEM_DIR=/system-data`.
Companion configuration sets `GATHER_NOTIFICATION_VAULT=/vault/settings.sqlite` and
`GATHER_NOTIFICATION_KEY_FILE=/run/secrets/gather-notification-key`.
These environment values are file paths, not credentials. The bootstrap decrypts
credentials into process memory before starting the application. They are not
Docker environment metadata or `.env` files. The app bootstrap selects encrypted storage when `GATHER_SYSTEM_DIR` is truthy.
An unset or empty value skips its vault read. Omitting a Compose entry does not
remove a nonempty image default; inspect the exact image before assuming omission
selects a different mode. This observation does not establish the companion's
fallback contract, authentication requirements or recovery support. The encrypted
quickstart requires both vaults and keys and does not select environment fallback.

Keep key files outside the data/backup directory, restrict permissions, and mount
them read-only. Docker/Swarm/Kubernetes secrets or an external secret manager can
supply these key files. Encryption protects stored records and backups; a process
that legitimately uses a credential can access it in memory. Protect the host and
application accordingly. Back up encryption keys separately; lost keys cannot be
recovered from the encrypted data.

## Recovery controller

`system/controller.py` runs on the host with operator-fixed app, companion and
gateway container names. It accepts no shell commands or target paths from the UI.
The web app does not mount a Docker socket. Run it as a supervised service, with
exclusive controller locking and read/write access to the encrypted data directory.
The editor refuses to queue changes unless the controller heartbeat is current.

Applying validates connections, queues ciphertext, backs up both active records,
and restarts only the configured services. Confirm within ten minutes after a
fresh OIDC login through the new configuration. Existing sessions cannot confirm.
The controller restores both previous encrypted records if the deadline expires,
services fail health checks, or activation is interrupted. A restart of the
controller resumes the recovery state; an interrupted activation rolls back.

Do not manually edit active records while an apply is pending. For emergency
recovery, stop the app, companion and controller, restore a consistent offline
backup of all three SQLite databases, then restart the services. Do not restore
only one database or reset pending recovery state independently. Preserve both records and their matching
keys. The deployment origin, callback path and bootstrap storage paths remain
operator-owned so a UI change cannot redirect this recovery mechanism.

The host controller is a privileged component: its program and service definition
must remain operator-owned, outside web-writable volumes. Configuration migration
should encrypt original environment-file backups before removing the plaintext
copies. This does not migrate production automatically.

### Optional isolated controller container

`system/Dockerfile` and `system/compose-controller.example.yaml` package the recovery
controller separately. It has no network interface, no encryption keys, a read-only
root filesystem and no Linux capabilities. It accesses Docker through the Unix
socket and accepts only operator-fixed container names; it does not execute shell
commands or expose an HTTP API. The web app cannot modify its code.

**Docker socket access still grants broad Docker/host-control potential if the
controller is compromised.** Container hardening does not make that socket a
restricted API. Deploy this optional component only with the host owner's explicit
approval. Without a running recovery controller, UI apply remains disabled rather
than making an unrecoverable authentication change. A separately operated host
service can perform the same protocol where that is preferable.

## SQLite layout and migration

Node 22.13 or newer supplies the built-in SQLite driver; no database server or
additional listening port is needed. `system/migrate-sqlite.py --root /system-data`
is an **offline** migration: stop the app, companion and recovery controller first.
Finish any pending configuration activation before migrating. It refuses to
overwrite existing databases. Validate both decrypted records against the legacy
records before deploying; retain the original ciphertext as an offline migration
backup. Never fall back to it automatically when a database is missing or corrupt.

Three databases preserve the service boundary:

- `app/settings.sqlite`: encrypted authentication/integration record and rollback.
- `notification/settings.sqlite`: encrypted companion record and rollback; only
  this database directory is mounted into the companion, read-only.
- `control/settings.sqlite`: ciphertext requests, recovery state and an operational
  event history containing timestamps, actions and revision IDs, never credentials.

Each database has a schema version and migration history. Files are mode `0600`
and parent directories should be `0700`, owned by the deployment service UID.
Keys remain outside the database directories and are never inserted into SQLite.
All record fields (including non-secret connection settings) are encrypted before
insertion, so rollback journals also contain ciphertext rather than credentials.
Statements use bound parameters and disable trusted schema; extension loading is
disabled in Node and never enabled in Python. Missing/incompatible stores fail
closed. No credential field is returned to the browser.

Activation/rollback updates both records, the recovery state and the request queue
in a single attached-database transaction. DELETE journaling and FULL synchronous
writes are required for multi-database atomic commits; do not switch these stores
to WAL or place them on a filesystem without reliable SQLite locking/fsync.
The controller commits before restarting services and retains a rollback slot.
After an interrupted activation, it restores both records transactionally.
Concurrent/stale apply requests are rejected within the write transaction.

Back up all three databases while all writers are stopped (app and controller),
or use a coordinated snapshot that preserves the whole transaction set. A live
file copy or separate per-database online backups are not a consistent set.
Store keys separately from database backups. Test restoration on an isolated
instance before relying on the backup. Operational audit entries are local,
not tamper-proof against host or application compromise.

Encryption at rest does not prevent a compromised running application or host
administrator from using its mounted keys. The existing controller's Docker
socket remains a privileged boundary. For deployments requiring keys outside
host control, use an external secret manager/KMS rather than storing keys beside
backups. SQLite is a persistence improvement, not a substitute for these boundaries.

This migration covers system configuration. Dashboard YAML and the notification
service's existing user-state store retain their current formats.

## Local account installations

When setup was initialized without OIDC credentials, System shows **Local accounts**
and tests the notification connection without OIDC discovery. Manage account
passwords in Users & access or My preferences. Notification and protected
administrator changes still use the recovery controller's apply, fresh sign-in,
confirmation and rollback sequence. The sign-in-again button opens the local login
page. Configuring OIDC or changing authentication modes requires an operator migration;
this local-account form does not replace the current identity system.

When an operator adds OIDC later, the active server configuration must contain
the issuer, client ID and client secret together, plus the OIDC administrator's
subject in `GATHER_ADMIN_IDS`. Restart Gather after changing that configuration.
Complete OIDC configuration takes precedence over the original local-account
marker; partial OIDC configuration prevents authentication from starting. Existing
local sessions lose access, while local credentials remain in the user database.
An OIDC identity is separate from a local identity even when their emails match;
roles and personal dashboards are not automatically transferred. Restoring the
local configuration and administrator subject allows local sign-in again.

Local credential hashes and account profile records live in
`config/.gather-users.sqlite`, separately from the encrypted system vault. Include
that database in complete backups; restoring only the vault does not restore local
accounts. Password changes increment a credential version, immediately invalidating
old application, notification-session and session-based MCP access.
