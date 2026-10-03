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
When OIDC is absent, Gather supports separate local accounts. The first protected
administrator is created during encrypted setup; administrators create additional
users with a name, email, unique username, initial password and role in Users &
access. Username matching is case-insensitive. Passwords require 12–1024 characters
and are stored as individually salted scrypt hashes, never returned in the user
list. Local emails are profile information, not provider-verified identities.
Users change their own password in My preferences; administrators can reset other
users' passwords. Both operations invalidate existing sessions. The protected
administrator changes its own password with its current password. Account disabling
blocks sign-in and existing sessions. There is no public account registration or
email invitation. Five failed attempts lock an account for one minute.

With OIDC, Add a name, email and role to prepare access, then review the change. This creates a Gather record, not an identity-provider account, and sends no email.
The existing OIDC provider must verify the email before a prepared role is claimed.
Users whose identity has no prepared role retain shared-dashboard access as viewers. Existing server-configured administrators remain protected.

- Viewers can view dashboards but cannot edit Gather configuration or personal dashboards.
- Editors can customize their own personal dashboard.
- Administrators can manage Gather configuration and users. System connection settings require a protected server administrator; these bootstrap administrators remain available for recovery.
- Disabled users are blocked at the application boundary; their notification session and session-based MCP access are also rejected.
- These roles govern Gather. Access inside linked services remains controlled by those services and the operator's configured shared integrations.

My dashboard uses the same Appearance, Tabs, Layout, Services, Bookmarks, Home widgets, and Backup & restore editors as Dashboard Settings. Editors and administrators save their own documents, without modifying shared configuration. Existing personal layouts and links seed the new dashboard on first use. Service integration data can be selected from the shared-service dropdown; credentials and server connections remain centrally managed. Custom JavaScript, server connections, and user administration are not personal dashboard sections.

Choose **Use my dashboard**, **Use shared dashboard**, or paste a shared dashboard link to set the account's current dashboard across devices. `/?dashboard=mine` opens your own dashboard; `/?shared=1` always opens the shared dashboard. Choosing a shared dashboard does not delete your personal work.

**Share my dashboard** creates a view-only link for enabled, signed-in Gather users. Recipients cannot edit the owner's documents, even if they have editor access to their own dashboard. **Stop sharing** invalidates that link and saved selections using it; re-enabling sharing creates a new link. Disabled owners' shared dashboards are unavailable. Viewers can select dashboards but need editor access to customize or share their own.

Personal documents, saved versions, sharing tokens and current selections are stored in `config/.gather-workspaces.sqlite`; include it in backups. The latest 50 document snapshots support personal section restore. Legacy layout records remain in `.gather-users.sqlite`. Presentation choices do not restrict access to centrally configured services.

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
a labeled power state to a service card. VM metrics are visible by default, with
explicit **Hide metrics** / **Show metrics** buttons. A per-service `showStats: false`
starts that VM collapsed; the global stats preference does not hide these metrics.
An
inventory summary card shows total, running, stopped and suspended VMs. Cards poll
every 30 seconds while visible; server requests share a 15-second inventory cache.
Running VM cards also show CPU utilization (%), active memory (estimated guest
working set), host-consumed memory (physical memory consumed on the host), and the
relative **Updated** age based on the actual sample timestamp. Allocated CPUs and memory stay visible as separate values.
These cards do not offer power/lifecycle controls.

Performance data is read through the vSphere Web Services `/sdk` endpoint using
the same HTTPS origin and service account as inventory. Gather negotiates the
server API version from ServiceContent, discovers counter IDs and provider
sampling intervals, and uses `QueryPerf` for up to 50 published, running VMs per
batch. It queries `cpu.usage.average`, `mem.active.average`, and
`mem.consumed.average` when available. No agent inside the VM is required.
Performance results are shared for 20 seconds, including failures to prevent
retry storms; counter metadata and sampling rates are cached for five minutes.
Requests time out after ten seconds, with a 45-second collection deadline and a
separate five-second logout timeout.

The account needs `System.View` on the monitored entities (normally supplied by
the read-only role). Its visibility determines available metrics; Gather does not
change vCenter roles, permissions, statistics levels or collection intervals.
The `/sdk` endpoint must be reachable through your firewall/proxy with the same
trusted certificate requirements. **Check & load inventory** now checks performance
access for one running VM and reports permission, compatibility or sampling issues.

Missing/unsupported counters display a dash, never a fabricated zero. Powered-off
VMs are not queried for performance. Samples older than three sampling intervals
(with a 90-second minimum), or unexpectedly in the future, are marked as older
samples. An API/permission failure preserves inventory, allocations and power
status. VM deletions/inaccessible inventory continue to show unavailable status.
See the [PerformanceManager API](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.PerformanceManager.html),
[query specifications](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.PerformanceManager.QuerySpec.html),
and [memory counter definitions](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/memory_counters.html).

A development-only visual preview is available at `/preview/vcenter`. It uses
sample readings and never connects to vCenter. Live compatibility must still be
verified on staging using its service account and server certificate.

ESXi hosts use the same connection. After loading inventory, choose **Hosts**, select
hosts, choose a destination tab/group and review the additions. Each host card shows:

- Connection state separately from maintenance mode and vCenter-reported overall health.
- CPU utilization from host quick statistics divided by total physical CPU capacity.
- Used and total host memory, plus running/total VMs visible to the service account.
- An **Updated** age based on retrieval time, rather than a performance sample timestamp.

Host cards poll every 30 seconds and share a 20-second server cache. Host properties
and VM power states are retrieved in batches through `/sdk`, including paginated
responses. Disconnected hosts never present cached utilization as current or show
a healthy status; missing metrics and incomplete VM counts display unknown values.
No maintenance, power or configuration changes are made to ESXi. These are hosts
managed by vCenter; standalone ESXi connections are not included.
The source binding is `vcenterServer: lab` plus `vcenterHost: host-123` on a service.
See the [HostSystem reference](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.HostSystem.html)
and [host quick statistics](https://developer.broadcom.com/xapis/vsphere-web-services-api/latest/vim.host.Summary.QuickStats.html).

A protected server administrator configures the connection, saves it, then selects
**Check & load inventory**. Select VMs and/or the summary, choose an existing tab /
service group, review and **Add to dashboard**. This merges into `services.yaml`,
checks its revision, and creates the usual backup. Existing linked VMs are skipped;
name collisions receive a suffix instead of overwriting an existing service.
Create new groups in Services and assign their tab in Layout before importing.

Cards open the specific VM or host summary in vCenter. Existing generic `/ui` links are resolved automatically using the configured connection and object ID; custom application URLs are preserved. In Services, change the Service URL to the
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

### Removing vCenter cards

Use **Connections → vCenter → On your dashboard** to remove VM, host, or overview cards.
Removal works without loading live inventory. Confirm **Remove card** to save the change;
a configuration backup is created. Only the Gather service card is removed, never the
VM or ESXi host. Other services and groups are preserved. Reload the list if another
editor changed a card before removal.
