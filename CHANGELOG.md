# Gather release notes

## Unreleased

- Add account-specific notification health, device management and expected badge diagnostics.
- Add quiet hours, topic muting, priority-based critical bypass and repeated-alert grouping.
- Add About & updates with component versions, build channel and mismatch warnings.
- Show widget refresh age, stale/error status and offline state.
- Add protected, encrypted complete backups with inspection, coordinated restore and automatic rollback.
- Add separate phone layout ordering, density and pinned favorites per account and dashboard.

## 1.0.4

- Remember the browser's push opt-in per account and notification prefix. Restore
  missing subscriptions on open/resume while OS permission remains granted,
  preserve explicit opt-outs, and reject recovery requests after a sign-in change.
- Include the account's unread inbox count in encrypted Web Push payloads so
  installed apps can update their badges while closed without a signed-in fetch.
- Keep a shared persistent inbox of the latest 200 retained messages, refresh it
  incrementally, and reject truncated ntfy replays, including errors delivered
  after HTTP 200. Preserve the last complete snapshot and back off retries instead
  of reporting a false zero unread count.
- Retain read/dismiss state, badge preferences, VAPID keys and subscriptions in
  the existing notification data directory. Push tests use the real inbox count.
- Include the Avalon Nano 3s integration previously available on the production
  channel, with read-only miner telemetry refreshed every 10 seconds.

Upgrade all three Gather images together to 1.0.4 and preserve notification
`/data` with the other state and keys. No first-use reinitialization is needed;
the companion creates its retained inbox cache on startup. Supported installed
apps need notification permission and badges enabled. Reading on another device
updates a closed app's badge on its next push or open. Automated regression and
live inbox/count checks passed; physical iPhone background badge verification
remains pending. See [notification behavior](docs/gather/notifications.md).

## 1.0.3

- Verify TrueNAS v2 WebSocket TLS certificates before sending API keys or login
  credentials. Use HTTPS with a certificate matching the configured hostname;
  mount a private CA and set `NODE_EXTRA_CA_CERTS` when needed.
- Replace legacy shared-password SHA-256 comparisons with randomly salted
  scrypt. Accept 1–1024 characters and limit verification to two concurrent
  attempts per application process; excess attempts fail and may be retried.
  Separate local accounts and OIDC retain their existing authentication behavior.
- Bound notification Web Push key validation before matching and decoding.
- Remove Unraid JSX spread children and preserve mapped pool field selection,
  resolving the CodeQL extraction warning.
- Add adversarial image-picker and real untrusted-TLS regression coverage.
  Record two CodeQL false positives and the required MyJDownloader protocol hash
  exception without disabling analysis or excluding files.
- Guard GameDig's existing disabled HTTP cache behavior with a real HTTP-client
  regression test. The transitive dependency itself is not patched.
- Align installation examples, all three image versions, and release guidance.

Upgrade all three Gather images together to 1.0.3. Existing encrypted state,
individual local accounts and OIDC identities are retained; no reinitialization
or database migration is required. Back up state and keys before upgrading.
Review TrueNAS certificate trust and shared-password limits before restarting.
Immutable image identities and validation evidence are recorded in the GitHub
release. See [INSTALL.md](INSTALL.md) and [SECURITY.md](SECURITY.md).

## 1.0.2

- Separate local usernames/passwords when OIDC is absent, with administrator,
  editor and viewer roles and a protected first-use administrator.
- Account creation, password resets and disabling in Users & access; self-service
  password changes in My preferences. Individually salted scrypt hashes,
  temporary lockouts, and credential versions that invalidate old sessions.
- Complete OIDC configuration takes precedence; partial configuration fails closed.
  Existing explicit shared-password installations retain their shared identity.
- System settings use the same authentication-mode rules as login. Regression
  tests cover storage persistence, permissions and local-to-OIDC migration/rollback.

Existing OIDC installations are not reinitialized. Local and OIDC identities remain
separate even when emails match; roles and personal dashboards are not transferred.
Back up the user database with configuration, system records and keys. All three
images use 1.0.2; immutable image identities are recorded in the GitHub release.

## 1.0.1

The encrypted Compose quickstart uses an explicit image-owned initializer, writes
canonical Gather configuration, and preserves complete state on retry while
refusing partial state. One Compose file replaces the old setup ZIP.

## 1.0.0

Gather's first public release builds on Homepage v2.4.0. Gather's version is
independent of the inherited Homepage release series.

- Gather names in source, environment configuration, discovery labels,
  Kubernetes annotations, integration client identifiers, MCP tools and help links.
- One `gather-oidc` callback and a configurable shared-password account subject.
- Offline, preview-first prefix migration with protected backups and
  authenticated re-encryption of managed variables and app vault records.
- Native navigation, account controls, notification inbox, and installed-app branding.
- Guided editors for services, bookmarks, Home widgets, appearance, layouts,
  custom styles, configuration import/export, and versioned saves.
- OIDC identities, administrator/viewer roles, account preferences, personal
  dashboards, and view-only sharing between signed-in users.
- Encrypted integration variables, SQLite system configuration, and an optional
  isolated controller for supervised authentication rollback.
- Account-scoped notification state, Web Push delivery, and installed-app badges.
- Gather integrations for vCenter inventory/performance, Bitcoin Node, Bitaxe,
  NerdAxe, Wazuh, Velociraptor, and missing-only Radarr calendar entries.
- Guided widget catalog coverage and fixes for navigation, credentials, imports,
  recovery transactions, and dependency security updates.

### Installation and compatibility

Use [INSTALL.md](INSTALL.md) and the current
[documentation](https://gather.daredevilbear.dev/). Existing Homepage YAML formats
remain importable after migrating configuration names. Review dashboard imports
before saving; back up configuration, all SQLite state, and keys separately.
Shared integration visibility is unchanged by personal dashboard layouts.

All three images use release `1.0.0`, support `linux/amd64` and `linux/arm64`, and
include source revision labels, GPL notices, SBOMs, and build provenance. The
GitHub release records their immutable digests after the release pipeline passes.
Tagged releases promote the verified main image by digest, preserving commit-tag
identity. No application deployment is performed.

### Operational limits

The optional notification service and recovery controller require explicit
configuration. A controller socket grants Docker authority. Distinct user accounts
require an identity provider; password authentication uses one shared identity.
Web Push, accessibility, and external integrations must be checked in the
operator's intended browser, device, and environment. Development previews and
CI mocks do not establish real device delivery or every service's compatibility.
