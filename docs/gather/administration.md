# Gather administration

## Local review

Run `pnpm dev:preview` and open `http://127.0.0.1:3022/preview/settings`.
This route is development-only and uses sample data. It does not change a deployed dashboard.
The appearance sample updates title, icon, theme, color and tab/group labels, but does not run service integrations.

## Homepage migration

1. Back up the original Homepage configuration directory and keep the original installation available.
2. Configure Gather's existing sign-in provider and authorize an administrator.
3. Open Dashboard settings → Import from Homepage.
4. Upload and review each file separately: `settings.yaml`, `services.yaml`, `bookmarks.yaml`, `widgets.yaml`, `custom.css` and `custom.js`. A protected server administrator can also import `docker.yaml`, `kubernetes.yaml` and `proxmox.yaml`.
5. Import replaces one complete file at a time, with a version check and a backup. Settings imports retain destination Gather preferences.
6. Copy local images, certificates, kubeconfig files and other referenced mounted files separately. Configure referenced environment values before relying on integrations. Connection files remain editable under Connections for protected server administrators.
7. Verify tabs, links and service connections. Use Backup & restore to undo individual file imports.

Environment placeholders are retained. YAML syntax and document structure are validated; this does not test connection credentials or network access. Custom JavaScript requires an explicit trust acknowledgment because it executes in visitors’ browsers. Compose files, environment files and arbitrary archives are not imported. MCP remains configured through its existing server environment settings, not a dashboard YAML file.

## Secrets and variables

The administrator-only editor stores managed values encrypted in `config/.gather-variables.sqlite`.
It requires the existing 32-byte Gather app key at `GATHER_APP_KEY_FILE` or `/run/secrets/gather-app-key`.
There is no plaintext fallback. Back up the database and preserve the corresponding key separately.

Names use `HOMEPAGE_VAR_` so existing Homepage placeholders continue to work, for example `{{HOMEPAGE_VAR_MEDIA_TOKEN}}`.
Secret values are masked and never returned by the management API. Non-secret variables are visible to administrators.
Use secrets in private integration credential fields, not in titles, descriptions or destination links that appear on the dashboard.
The server environment retains precedence; the editor rejects names already configured there.
Replace value opens and focuses a replacement form above the saved list; the existing value remains active until Save replacement succeeds. Cancel replacement discards the draft.
Disable is reversible; it retains the encrypted value. Changing a value's secret/variable type requires a new name.

## Account preferences and notifications

My preferences controls Home widget placement above or below tabs. Preferences are account-scoped in `config/.gather-preferences.sqlite`.
The notification inbox has its own account-scoped preferences for compact/full-page opening, push-click destinations and app badges.
The default push-click destination is `/notifications`; users can select the compact inbox instead.
Notification preferences are stored with the companion's existing push database.

Badges count unread messages in the same latest-200/30-day inbox window. They refresh when the inbox synchronizes or a push arrives.
A closed second device catches up at its next push or app opening; reading elsewhere does not generate silent pushes.
Badge support and notification permissions are controlled by the operating system. Physical iOS/macOS installation and delivery need device testing.

Installed app icons are opaque squares so the OS can apply its own mask. Regenerate them with `node scripts/generate-gather-icons.cjs`.
An existing installation may retain cached icons until it refreshes its manifest or is reinstalled.

## Accessibility verification

Settings use labeled controls, visible keyboard focus, native dropdowns, search result announcements, larger multiline editors and corrected light-preview contrast.
This is incremental accessibility work, not an ADA certification or a completed screen-reader/device audit.

## Users, roles and personal dashboards

Users & access lists people by name and email, with role, access status, last activity and a bounded activity history.
Add a name, email and role to prepare access, then review the change. This creates a Gather record, not an identity-provider account, and sends no email.
The existing OIDC provider must verify the email before a prepared role is claimed.
Users whose identity has no prepared role retain shared-dashboard access as viewers. Existing server-configured administrators remain protected.

- Viewers can view dashboards but cannot edit Gather configuration or personal dashboards.
- Editors can customize their own personal dashboard.
- Administrators can manage Gather configuration and users. System connection settings require a protected server administrator; these bootstrap administrators remain available for recovery.
- Disabled users are blocked at the application boundary; their notification session and session-based MCP access are also rejected.
- These roles govern Gather. Access inside linked services remains controlled by those services and the operator's configured shared integrations.

My dashboard is a separate, account-owned collection of links with tab grouping and revision-checked saves.
This first version does not clone shared integration widgets or create separate Docker/Kubernetes credentials per user.
The shared dashboard remains available; personal records do not change its layout or another user's links.
Personal dashboard data and named activity history live in `config/.gather-users.sqlite`; back this up alongside configuration and preference databases.

Notification identities use the stable sign-in subject. Legacy email-based notification state is migrated only for verified email claims.
An unverified legacy sign-in may need to reset browser push and enable it again. That resets the local browser subscription without deleting another account's server records.

## Group names

Layout edits each group’s visible name using `layout.<configuration key>.displayName`.
Services, Bookmarks and the dashboard render that label. The configuration key stays stable, preserving service API references and discovery labels. Advanced source edits can still change the underlying key, but must coordinate every reference. Removing a layout also removes its display-name override.
