# Integrated settings editor

Gather has an administrator-only editor at `/settings`. Authorized administrators
also see **Dashboard settings** inside the account menu. The menu’s **Account
settings** link still opens the identity provider’s profile page.

Enable the editor in the app's protected deployment environment:

```dotenv
GATHER_AUTH_ENABLED=true
GATHER_EDITOR_ENABLED=true
GATHER_ADMIN_IDS=stable-oidc-subject-id
```

Use the OIDC `sub` value, not a display name or email address. Multiple subject IDs
can be comma-separated. For the shared password provider the identity is
`homepage`; authorizing it makes every holder of that shared password an editor.
Keep the allowlist in deployment configuration, outside dashboard-editable YAML.
The editor is disabled by default, including when authentication is disabled.
Existing sign-in configuration is required; the editor does not create identities.

## Editing

- **Dashboard:** title, theme, color, favicon, group layout/tabs, account menu,
  account settings URL, notification inbox, and all additional settings.
- **Services:** create, rename, remove and reorder groups/services; edit links,
  icons, descriptions and integration widget properties.
- **Bookmarks:** group and link management with ordering.
- **Header widgets:** edit nested widget options, order widgets, and add common
  presets or custom named objects.
- **Push & topics:** companion subscriptions, app name and same-origin icon path.
- **Custom CSS / JavaScript:** source editing for trusted administrators.

Fields absent from a form remain in the configuration. Advanced properties can
be added with text, number, checkbox, object and list types. Source mode accepts
YAML or JSON directly. Environment references are not substituted by the editor.
Raw configuration can contain inline secrets and is visible only to authorized
administrators; prefer environment placeholders. Visual edits normalize YAML
formatting and remove comments, so inspect Source before saving when needed.

Each section saves independently. Validate checks syntax and structural shape,
not every third-party widget's connection requirements. Save & apply validates,
backs up the current file, atomically replaces it, and revalidates dashboard props.
Open or reload the dashboard to inspect the result. Existing widget APIs continue
to provide their normal diagnostics; Check connections checks the dashboard and
notification companion without making arbitrary network requests.

## Custom API mappings

In Services, expand a service, choose its integration widget and select Custom API.
Set the server URL and required credentials/method. A URL alone does not define
output fields. Before Save & apply, open Source and add response mappings:

```yaml
widget:
  type: customapi
  url: http://mock-services:8090/mock/api/health
  mappings:
    - field: healthy
      label: Healthy
      format: number
    - field: degraded
      label: Degraded
      format: number
    - field: offline
      label: Offline
      format: number
```

For the fictional response `{"healthy":12,"degraded":1,"offline":0}`, check all
three values on the dashboard after saving. Integration URLs are fetched from the
Gather container. Card links and IFrame sources are browser URLs. The guided form
does not currently expose these mappings; Source completes the supported workflow.

## Notification preferences

Mount the non-secret runtime subdirectory into the companion read-only:

```yaml
volumes:
  - ./config/.gather-runtime:/config:ro
```

The editor writes `config/.gather-runtime/gather-notifications.json`. The companion
reads it on requests and polls. Defaults come from its environment; server URL,
authentication credentials, session endpoint and VAPID keys cannot be changed here.
Only topics permitted by the ntfy account will work. Changing topics starts push
polling at the change time, rather than replaying historical notifications. Inbox
history remains available for currently configured topics. Icon updates reach
registered workers on their next update; iPhone installed-app icons also use the
native manifest/favicon configuration.

## Recovery and security

The API independently verifies the authenticated subject on every read and write.
Mutations require the exact configured dashboard origin and a custom request
header. File names are fixed; no arbitrary filesystem paths are accepted. Writes
use a filesystem lock and revision hash to reject concurrent or stale changes.
The lock is fail-closed after a crash: an operator must confirm no writer is active
before removing a leftover `.gather-editor.lock` file.

Backups live in `config/.gather-backups`, outside public routes, with restrictive
permissions. Restore checks the current revision and backs up the current version
first. The UI lists the latest 50 copies per section; older copies remain on disk.
Operators should include these directories in their normal backup/retention plan.
Scripts intentionally execute with dashboard users' browser access: only trusted
administrators should receive editing rights. No Docker socket is required.
