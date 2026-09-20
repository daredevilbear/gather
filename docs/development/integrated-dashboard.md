# Integrated dashboard migration

Status: native account and notification components implemented; isolated staging validation in progress. Production has not been replaced.
Project: Gather. Repository: daredevilbear/gather.

## Baseline

Start from Homepage v2.4.0, commit 6b6926108e35c3902dd23f6bc337162b7289450b,
matching the live image inspected on 2026-09-20. Preserve the upstream Git history,
GPL-3.0 license, notices, and an `upstream` remote. The existing installation uses
a floating image tag; the new deployment must pin release images and retain rollback.

Homepage UI is ghcr.io/bangertech/homepage-ui at source revision
870978068926642d174c93d545715a73f284e3d5. Its README declares MIT but the checked-out
repository has no LICENSE file. Phase two can implement equivalent behavior;
verify the actual license grant and attribution before importing editor source.

## Milestone 1: preserve existing behavior

- Native account disclosure: avatar, name, account settings, sign out; Keycloak OIDC.
- Responsive header: account above notifications on mobile, rightmost on desktop.
- Notification inbox: topic/title/time/body/priority, safe HTTP(S) links, unread count,
  All/Unread/High priority filters, individual read/dismiss, and mark-all-read.
- Read/dismiss state synchronized per signed-in account across devices.
- Filter selection persisted per account in the browser; push deep links must not
  overwrite that preference and must reveal a read or dismissed target.
- Existing-window push handoff, cold-start deep links, expired-message handling,
  retained message lookup outside the most recent 200 entries.
- Web push subscription controls and test delivery, installed-app manifest/icons.
- Existing upstream service integrations, tabs, search, widgets, configuration,
  themes, and OIDC behavior remain compatible.

Implement components owned by React, without DOM insertion observers. Keep ntfy
and push delivery as separate services. Make the notification API prefix, feed
connection, account URL, branding, manifest identity, and assets configurable.
No Bearnet hostnames, personal images, user data, or tokens in project defaults.
Prefer existing Homepage auth/session mechanisms over introducing another login.

## Milestone 2: integrated visual configuration

Match the installed editor's functional scope: first-run setup; service and group
CRUD/reordering with widget forms; bookmarks; information widgets; appearance and
layout settings; custom CSS/JS editing; configuration backup/restore; connection
checks; and apply/reload behavior. Container restart is optional deployment
functionality and must not require exposing an unrestricted Docker socket to the
public web process.

Editing requires explicit administrator authorization, independent of being a
signed-in dashboard viewer. Read access must not expose resolved environment
secrets. Use fixed config file allowlists, validation before writes, backups,
atomic replacement, stale-write detection, and CSRF protection for mutations.
Implement public-facing defaults without relying on trusted private-network access.

## Staging isolation

Use a separate staging hostname. Protect it with the OIDC provider and
the same network restrictions as the current dashboard. Use a separate config
copy, auth/session secret, Keycloak client, notification state database, VAPID
keys, service worker origin, and push subscriptions. Staging must not consume or
change production unread state, send duplicate production pushes, write live YAML,
or replace the current dashboard. Subscribe to a staging test topic initially.

Secrets and deployment-specific configuration stay outside the source repository.
The existing production subscriptions, keys, read state, and configuration are
preserved for an eventual explicit cutover; they must not be overwritten by staging.

## Release gates

- Build, lint, component tests, and authentication/API tests pass.
- Desktop and mobile browser coverage for header layout and account disclosure.
- Inbox persistence across reloads/account changes and cross-device state sync.
- Worker cold/warm navigation, safe link handling, and expired-message behavior.
- Isolated staging login, service integrations, and real push delivery checked.
- Test editor authorization, validation, backup/restore, and concurrent saves in phase two.
- Tagged Docker image, documented upstream version, migration notes, rollback recipe.

No automatic production cutover. Finish staging validation before proposing it.

## First implementation slice

The native account disclosure is available behind an opt-in setting:

```yaml
gather:
  accountMenu: true
  accountSettingsUrl: https://accounts.example.com/
```

It consumes the existing NextAuth session and sign-out flow, displays the signed-in
user, and omits the account link unless a credential-free HTTPS URL is configured.
The default remains disabled during migration. Enabling it should be paired with
removing the old custom.js account injection in the isolated staging config.
The native notification inbox and shared responsive header are now implemented. See [notification setup](../gather/notifications.md) for companion service configuration.
