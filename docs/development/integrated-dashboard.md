# Gather development principles

Gather builds on Homepage v2.4.0, commit
6b6926108e35c3902dd23f6bc337162b7289450b. Preserve upstream source history,
GPL-3.0 licensing, copyright notices, and attribution. No Homepage UI editor
source was incorporated; review licensing before importing third-party code.

Native React components provide navigation, accounts, notifications, and visual
configuration. Administrator editing requires explicit authorization independently
of dashboard sign-in. Reads must not reveal resolved credentials. Configuration
writes use allowlists, validation, stale-write detection, atomic replacement,
and recoverable backups. Keep Docker authority in the optional controller.

Test changes in an isolated instance with separate origins, authentication
clients, configuration, encryption keys, notification subscriptions, and state.
Keep private deployment configuration outside the repository. Publishing
containers is separate from deployment.

Development targets `dev`; reviewed releases merge to `main`. See
[CONTRIBUTING.md](../../CONTRIBUTING.md), [RELEASING.md](../../RELEASING.md), and
[the public guides](https://gather.daredevilbear.dev/) for current procedures.
