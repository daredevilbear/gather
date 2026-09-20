# Secure system configuration

Administrators open **System configuration** from Dashboard settings (`/system`).
The page manages OIDC issuer/client credentials, ntfy connection credentials and
administrator subject IDs. It never returns stored secret values. Blank secret
fields retain the current value; replacing a connection destination requires new
credentials. New ntfy destinations require HTTPS. Existing internal HTTP ntfy
connections can be retained. Tests reject redirects and verify OIDC discovery and
ntfy topic access. An OIDC client secret can only be fully verified by signing in.

## Storage and startup

System records use AES-256-GCM with random 96-bit nonces and domain-specific
associated data. The app and notification companion use separate 256-bit keys.
The companion receives only its own record and key, not OIDC credentials.

The host provides these mounts (paths are examples):

- App: `/system-data` (encrypted records/control directory, writable).
- App: `/run/secrets/gather-app-key` and
  `/run/secrets/gather-notification-key` (32 raw bytes each, read-only).
- Companion: only `notification/` mounted read-only at `/vault`, plus its own key.

App configuration points to the store with `GATHER_SYSTEM_DIR=/system-data`.
Companion configuration sets `GATHER_NOTIFICATION_VAULT=/vault/active.enc` and
`GATHER_NOTIFICATION_KEY_FILE=/run/secrets/gather-notification-key`.
These environment values are file paths, not credentials. The bootstrap decrypts
credentials into process memory before starting the application. They are not
Docker environment metadata or `.env` files. The existing environment-based
configuration remains a compatibility fallback when no vault is configured.

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
recovery, stop the controller, restore the encrypted files in `rollback/` to each
service's `active.enc`, restart the configured services, then repair/reset control
state before starting the controller. Preserve both records and their matching
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
