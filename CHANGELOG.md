# Gather release notes

## 1.1.4

- Update Next.js and its matching ESLint configuration to 16.4.3, addressing the
  SVG image-optimization and typed-array cache remote-code-execution advisories
  and the Server Actions denial-of-service advisory.
- Update systeminformation to 5.33.18 for Windows command injection, Linux network
  interface path traversal and prototype pollution.
- Update transitive ip-address to 10.7.4 for bounded IPv6 zone parsing and
  development Zod to 4.6.6 for bounded oversized collection validation.
- Remove the unused npm/npx CLI tree from the final dashboard runtime filesystem,
  including its separate old ip-address copy. Package installation remains in
  the builder stage; native image checks guard the runtime exclusion.
- Align the app, notification companion, controller and installation examples on
  the same patch version. No application state format changes.

Upgrade the app and enabled companions together to 1.1.4. Existing 1.1.x state
needs no migration or first-use initialization. Preserve configuration, SQLite
state, notification subscriptions and keys. The release records the verified
immutable image set for both `linux/amd64` and `linux/arm64`.

## 1.1.3

- Update Undici to 8.12.2 for the Kubernetes client and jsdom dependency paths,
  fixing fetch denial of service on excessive content encodings
  (GHSA-xjj6-f33q-929c) and unbounded EventSource parser memory
  (GHSA-4qv8-2p9j-2685), together with related Undici security fixes.
- Update Vitest and its coverage package to 4.1.12, fixing development mock
  registration code injection (GHSA-qxg6-89mg-rqv8) and Windows redirect path
  traversal (GHSA-xp26-3454-mjgp).
- Align the app, notification companion, controller and installation examples on
  the same patch version. No application behavior or state format changes.

Upgrade the app and enabled companions together to 1.1.3. Existing 1.1.x state
needs no migration or first-use initialization. Preserve configuration, SQLite
state, notification subscriptions and keys. The GitHub release records the
verified immutable image set for both `linux/amd64` and `linux/arm64`.

The dependency audit still reports separate findings in Next.js,
systeminformation, ip-address and development Zod. This release addresses the
four requested Dependabot alerts and related Undici advisories; it does not
claim that the full dependency audit is clean.

## 1.1.2

- Update source-map-js to 1.2.2 to fix an event-loop denial of service when
  processing indexed source-map section offsets (GHSA-68fv-2mgg-jv7q).
- Update Vite to 8.2.4 to fix development-server file disclosure and cross-origin
  script execution, plus vulnerabilities in its bundled editor launcher. The
  editor fixes cover Windows argument escaping and existence checks, and editor
  CLI flag handling.
- Align the app, notification companion, controller and installation examples on
  the same patch version. No application behavior or state format changes.

Upgrade the app and enabled companions together to 1.1.2. Existing 1.1.0 and
1.1.1 state needs no migration or first-use initialization. Preserve
configuration, SQLite state, notification subscriptions and keys. The GitHub
release records the verified immutable image set for both `linux/amd64` and
`linux/arm64`, with source labels, SBOMs and provenance.

## 1.1.1

- Update the dashboard build and runtime to Node.js 22.23.4 for the October 2026
  security fixes, with digest-pinned Alpine bases and fresh base pulls.
- Build ARM64 dashboard images on a native runner and check the patched Node
  runtime and native Sharp image processing before publication. Keep the
  builder and runtime on the same Alpine platform.
- Add an Appearance toggle for widget refresh status and an information icon
  for About & updates.
- Update Sharp to 0.35.5, follow-redirects to 1.16.1, and pinned CI actions.

Upgrade the app, notification companion and controller together to 1.1.1.
Existing 1.1.0 state needs no migration or first-use initialization. Preserve
configuration, all SQLite state, notification subscriptions and keys. Both
`linux/amd64` and `linux/arm64` images retain source labels, SBOMs and provenance;
the GitHub release records the verified immutable image set.

## 1.1.0

- Add account-specific notification health, device management and expected badge diagnostics.
- Add quiet hours, topic muting, priority-based critical bypass and repeated-alert grouping.
- Add About & updates with component versions, build channel and mismatch warnings.
- Show widget refresh age, stale/error status and offline state.
- Add protected, encrypted complete backups with inspection, coordinated restore and automatic rollback.
- Add separate phone layout ordering, density and pinned favorites per account and dashboard.

Upgrade the app, notification companion and controller together. Preserve existing
configuration, all SQLite state, notification data and keys; do not rerun first-use
initialization. Existing accounts and preferences are retained. Complete backups
require the supported persistent mounts and UID 1001, include secrets, and restore
to the same origin and app version with fresh sign-in confirmation. Keep external
services, ntfy history, custom mounted assets and integration credential files
outside Gather state in separate operator backups. Physical installed-device
background badge verification remains pending.

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
