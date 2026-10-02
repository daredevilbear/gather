# Gather release notes

## 1.0.0

Gather's first public release builds on Homepage v2.4.0. Gather's version is
independent of the inherited Homepage release series.

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
and `HOMEPAGE_*` settings remain compatibility interfaces. Review Homepage imports
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
