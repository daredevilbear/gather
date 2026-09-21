# Local interface preview

Run `pnpm dev:preview` from the Gather repository, then open
<http://127.0.0.1:3022/preview/settings>.

This runs Next.js in development mode, bound to loopback. Source edits appear
through Fast Refresh; no container build or deployment is needed. The ordinary
local dashboard is also available at `/` with the local config directory.

The settings preview uses the real editor and account-menu presentation with
representative sample services, tabs, bookmarks, and widgets. Saves, validation,
revision conflicts, and backups operate in memory in that browser tab. Reloading
resets the samples. No staging data, credentials, or live session is copied, and
no settings API writes or notification deliveries are made. The account control
in the preview banner demonstrates the Dashboard settings menu placement.

The preview route returns 404 outside development mode. The normal `/settings`
route and APIs retain their existing administrator and CSRF checks.

Use this preview for layout, responsive behavior, keyboard navigation, forms,
draft handling, and local save/restore flows. Real integration connectivity,
OIDC login, and Web Push still require authenticated staging validation after a
reviewed image is built. The preview's syntax checks are not a substitute for
the live configuration validator.

## Guided settings

The visual editor includes a searchable library of 164 service integrations and
12 Home widgets. Service metadata is generated from this fork's registry and
checked-in documentation with `node scripts/gather/widget-catalog.mjs`; no server
proxy modules enter the browser bundle. Custom options remain intact when guided
fields change and can be edited in Source. Switching widget types requires
confirmation and starts with fresh connection settings.

Icons can be selected from the built-in library or uploaded as PNG, JPEG or WebP
(up to 1 MiB and 4096 pixels per side). Preview uploads stay in the browser tab.
On an authenticated dashboard, uploads require administrator access and the
same-origin editor header. The server decodes, resizes and re-encodes them as PNG,
strips metadata, and stores reusable assets in `config/.gather-icons`. Include
this directory in configuration backups. Uploaded icons are served to dashboard
viewers through the authenticated image route; they do not require admin access
to display. The bundled icon library uses the same public icon CDN as services.

System settings appears in the shared navigation only with the server-granted
administrator capability. `/system` redirects to `/settings?section=system`.
The original system API authorization, origin checks, encrypted storage and
rollback workflow remain in force. The local preview uses a sample administrator
and simulated system actions, with no live authentication changes.
