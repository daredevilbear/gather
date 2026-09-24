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

My dashboard now configures the signed-in home page. Editors and administrators can rename/reorder tabs, move groups between tabs, choose columns, hide/reorder services and bookmarks, and select/reorder home widgets. Saves are account-owned and revision checked. Sign in on another device to use the same layout. `/?shared=1` displays the shared layout, and “Use shared layout” removes the personal override.

Personal layouts reference centrally configured services and widgets; connection credentials are never copied into a personal record. Hiding items is a presentation preference, not a service-access restriction. Newly configured groups can be added from My dashboard. Existing private links remain stored and accessible at the bottom of My dashboard.

User search matches names and emails of registered Gather accounts, with whitespace/case normalization, role/status filters, matching counts, empty-result help and refresh. It is separate from Add user and does not query an external identity-provider directory.

The role matrix distinguishes Viewer, Editor, Administrator and the protected server administrator. The latter is the recovery account matched by the provider’s stable subject ID in `GATHER_ADMIN_IDS`. This ID may be a GUID, but regular user management uses names and verified email; no GUID is required to add or assign an ordinary user. Keeping the recovery identity stable prevents email changes from unexpectedly transferring that privilege.
Personal dashboard data and named activity history live in `config/.gather-users.sqlite`; back this up alongside configuration and preference databases.

Notification identities use the stable sign-in subject. Legacy email-based notification state is migrated only for verified email claims.
An unverified legacy sign-in may need to reset browser push and enable it again. That resets the local browser subscription without deleting another account's server records.

## Group names

Layout edits each group’s visible name using `layout.<configuration key>.displayName`.
Services, Bookmarks and the dashboard render that label. The configuration key stays stable, preserving service API references and discovery labels. Advanced source edits can still change the underlying key, but must coordinate every reference. Removing a layout also removes its display-name override.

## vCenter

Connections includes Docker, Kubernetes, Proxmox and vCenter with distinct icons.
vCenter uses `vcenter.yaml`. Like Proxmox service bindings, a vCenter VM binding adds
power status to a service card; click the status to expand resource details. An
inventory summary card shows total, running, stopped and suspended VMs. Cards poll
every 30 seconds while visible; server requests share a 15-second inventory cache.
CPU and memory are **allocated resources**, not utilization metrics. Neither the
inventory nor these cards offer power/lifecycle controls.

A protected server administrator configures the connection, saves it, then selects
**Check & load inventory**. Select VMs and/or the summary, choose an existing tab /
service group, review and **Add to dashboard**. This merges into `services.yaml`,
checks its revision, and creates the usual backup. Existing linked VMs are skipped;
name collisions receive a suffix instead of overwriting an existing service.
Create new groups in Services and assign their tab in Layout before importing.

Cards initially link to the vCenter UI. In Services, change the Service URL to the
application hosted by the VM, or use **Remove vCenter link** to keep the service
without VM monitoring. The source equivalent is:

```yaml
- Infrastructure:
    - My VM:
        href: https://app.example.com
        vcenterServer: lab
        vcenterVM: vm-123
    - vCenter overview:
        href: https://vcenter.example.com/ui
        vcenterServer: lab
        vcenterSummary: true
```

Dashboard readers can query only VM references published in services, or aggregate
counts for a published summary. Full inventory and connection configuration remain
restricted to server administrators. Shared cards are visible to dashboard users;
personal layouts can hide/reorder them but are not an access-control boundary.
A removed/inaccessible VM or unavailable server displays an unavailable state.

```yaml
lab:
  url: https://vcenter.example.com
  username: "{{HOMEPAGE_VAR_VCENTER_USER}}"
  password: "{{HOMEPAGE_VAR_VCENTER_PASSWORD}}"
```

Create these managed secrets first. Use an account with read-only inventory access.
The origin must use HTTPS without an embedded username, password, path or query.
TLS verification stays enabled; install the internal CA in the runtime trust store
(for example with Node’s `NODE_EXTRA_CA_CERTS` and a mounted CA certificate).
The server authenticates, reads VM name/power state/CPU/memory and closes its API
session. The inventory endpoint does not return credentials or session tokens. Use placeholders rather than embedding credentials in the source configuration. Requests
time out after ten seconds and do not follow redirects.

The implementation targets the modern `/api/session` and `/api/vcenter/vm` routes.
See Broadcom’s [vSphere authentication documentation](https://developer.broadcom.com/xapis/vsphere-automation-api/latest/)
and [VM list API](https://developer.broadcom.com/xapis/vsphere-automation-api/latest/api/vcenter/vm/get/).
Local tests use mocked responses; verify your actual vCenter version, permissions
and CA trust before relying on the connection in staging.
