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

## 2. Persist configuration and configure sign-in

Mount a writable configuration directory at the application's `/app/config`.
Preserve this directory across container replacement. Configure the external origin
and authentication in the protected deployment environment:

```dotenv
GATHER_OIDC_PROVIDER_ID=gather-oidc
HOMEPAGE_AUTH_ENABLED=true
HOMEPAGE_EXTERNAL_URL=https://gather.example.com
HOMEPAGE_AUTH_SECRET=<a-random-secret-of-at-least-32-characters>
HOMEPAGE_OIDC_ISSUER=https://identity.example.com
HOMEPAGE_OIDC_CLIENT_ID=<your-client-id>
HOMEPAGE_OIDC_CLIENT_SECRET=<your-client-secret>
GATHER_EDITOR_ENABLED=true
GATHER_ADMIN_IDS=<your-stable-oidc-subject>
```

Register `/api/auth/callback/gather-oidc` at the external origin as the provider callback.
Use a provider that supplies distinct subjects and verified email claims for named
users. A shared password is a compatibility option, not a multi-user identity system.
Keep bootstrap administrator subjects outside dashboard-editable configuration.

These examples describe required settings, not a complete deployment manifest.
Configure your reverse proxy, HTTPS and allowed hosts for your deployment. For
encrypted system credentials and recoverable connection changes, follow
[Secure system configuration](system.md), including its key mounts and controller requirements.

## 3. Configure Gather

After signing in as a bootstrap administrator, open the account menu → Dashboard
settings. Set appearance, create tabs, then assign layout groups to those tabs.
Add services, bookmarks and Home widgets using the guided pickers. Source remains
available for advanced configuration. See [Settings editor](settings.md).

For an existing Homepage installation, follow the reviewable
[Homepage migration steps](administration.md#homepage-migration).
For managed secrets, mount the 32-byte app key and follow
[Secrets and variables](administration.md#secrets-and-variables).

Use Users & access to prepare named roles for existing identity-provider users.
This does not create provider accounts or send invitations. My dashboard provides
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
