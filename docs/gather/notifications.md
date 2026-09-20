# Native notifications (development preview)

Enable the native components in `settings.yaml`:

```yaml
gather:
  accountMenu: true
  accountSettingsUrl: https://accounts.example.com/
  notifications: true
```

The account settings URL is optional. Existing custom JavaScript that inserts an
account or inbox widget should be removed from the staging config to avoid duplicates.
The greeting widget accepts `personalize: true` to use the signed-in user's name.

The native inbox includes All/Unread/High priority filters, account-scoped local
filter persistence, synced read/dismiss marks, safe HTTP(S) message links, and
push deep links. A linked read/dismissed message remains visible regardless of the
filter. The backend retains message history according to the ntfy server's cache;
the list shows the most recent 200 and selected-message lookup covers 30 days.

## Notification companion

Build `notifications/Dockerfile` and mount a persistent writable `/data` directory
owned by UID 1001. Route `/gather-notifications/` on the **same HTTPS origin** to its
port 8080. Do not expose the companion or ntfy directly without authentication.
The companion authenticates every inbox/state/subscription operation by verifying
the caller's cookie with Gather's session endpoint. Mutations also require the exact
origin and `X-Gather-Push: 1` header. Static worker, manifest, and health endpoints
contain no private data. Use Gather's native `/site.webmanifest` for the installed app.

Required environment:

- `GATHER_ORIGIN`: public HTTPS origin, no path or trailing slash.
- `NTFY_AUTH`: `Bearer <read-token>` or `Basic <base64-user-password>`.
- `NTFY_TOPICS`: comma-separated topic names (letters, digits, `_`, `-`).

Optional environment:

- `NTFY_URL`: internal ntfy base URL; default `http://ntfy:8080`.
- `SESSION_URL`: trusted internal Gather session endpoint; default `http://gather:3000/api/auth/session`.
- `APP_NAME`: push test/manifest label; default `Gather`.
- `ICON_URL`: notification icon URL; default `/android-chrome-512x512.png`.
- `PUSH_DATA`: persistent data directory; default `/data`.

Keep credentials in a host-only environment file. Do not put publisher credentials
in `settings.yaml` or browser JavaScript. Back up `/data` (including the SQLite
database and VAPID private key) before upgrades. Replacing the VAPID key invalidates
existing subscriptions. Delivery retries expire after one day; invalid endpoints
are removed when the push provider returns 404/410.

On iPhone, install the dashboard using Add to Home Screen, open it, sign in, then
enable push. Filter preferences are browser-local; read/dismiss status is shared
for the same authenticated account. Push tests have no retained inbox message.

## Staging and rollout

Use a distinct hostname, OIDC client, config directory, ntfy topic/server, VAPID
key and data directory. Staging must never share production push subscriptions or
write the live dashboard's configuration. Run a real device test before production
cutover. The visual configuration editor is a separate upcoming milestone.
