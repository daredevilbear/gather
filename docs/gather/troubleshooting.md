# Troubleshooting Gather

Start with the deployed image revision, the affected route, and which component
reports the failure. Check whether the issue affects every user or one account,
and every integration or one service. Keep tokens, cookies, keys, and private
configuration out of screenshots and GitHub issues.

## Container image will not pull

Read the deployment manager's full pull error, not only its stack status.

| Error or symptom                 | Check                                                                  |
| -------------------------------- | ---------------------------------------------------------------------- |
| `unauthorized` / `denied`        | Deployment host has credentials with read access to the GHCR package   |
| `manifest unknown` / missing tag | Requested image and tag exist and publishing completed successfully    |
| DNS or connection timeout        | Host DNS, outbound registry connectivity, and proxy/firewall path      |
| No matching platform             | Image supports the host architecture; Gather publishes AMD64 and ARM64 |
| Old container still healthy      | It may be running a cached image; verify a new pull independently      |

The three images are `gather`, `gather-notifications`, and
`gather-system-controller` under `ghcr.io/daredevilbear/`. Use `dev`, `latest`,
an existing version tag, or a recorded digest according to
[Container builds](containers.md). Image publication and deployment are separate.

## Sign-in redirects, loops, or fails

Check the public HTTPS origin, `HOMEPAGE_EXTERNAL_URL`, allowed Host header,
OIDC issuer, client ID, and client secret. The registered callback must be:

```text
https://gather.example.com/api/auth/callback/homepage-oidc
```

Replace the example origin with yours. The reverse proxy must route that path to
the app and preserve the intended external origin. `HOMEPAGE_ALLOWED_HOSTS`
contains host names and any required ports, not complete URLs. Avoid a wildcard
as a substitute for fixing a host mismatch.

Use a fresh login after a system connection change. Existing sessions cannot
confirm the recovery controller's pending activation. If you changed the session
secret, users must sign in again. See [Setup](setup.md) and
[System settings](system.md) for bootstrap and rollback.

## Dashboard settings is missing or access is denied

Verify authentication is enabled, `GATHER_EDITOR_ENABLED=true`, and the recovery
administrator's stable provider subject (`sub`) is listed in `GATHER_ADMIN_IDS`.
A display name or email is not a substitute for that subject.

Viewers cannot edit. Editors can edit their own personal dashboards.
Administrators manage shared configuration and users, while protected server
administrators manage system connections. Prepared email roles require a verified
email claim. Adding a Gather user does not create an identity-provider account.
See [Users and roles](administration.md#users-roles-and-personal-dashboards).

## Saving reports a conflict, lock, or validation error

Reload the section after another administrator saves it; Gather rejects stale
revisions to avoid overwriting newer work. Validate Source for syntax and structure,
then check individual integration settings separately. Saving valid YAML does not
prove network connectivity or correct third-party credentials.

If an editor lock remains after a crash, an operator must verify no writer is
active before removing `.gather-editor.lock`. Check configuration-directory write
permissions and available disk space. See [Editor recovery](settings.md#recovery-and-security).

## Gateway returns 502 after an update

Confirm app and companion health, their Compose service names, ports, and shared
Docker network. A gateway with a stale upstream address may still target a removed
container. Use the repository's dynamic DNS template and
[gateway recovery instructions](containers.md#gateway-recovery-after-container-replacement).
Validate the proxy configuration before reload; an atomically replaced file mount
may require recreating only the gateway. Preserve volumes.

## Inbox, device push, or badges do not work

These are separate checks:

1. Enable `gather.notifications: true` and verify same-origin routing of
   `/gather-notifications/` to the companion.
2. Verify companion session validation against the app, ntfy connectivity,
   configured topics, and the read credential's topic access.
3. For push, check browser permission, installed-app state where required, and
   that `/data` and the original VAPID key persisted across replacement.
4. Send a device test. Push tests do not create a retained inbox message.
5. For badges, reopen the app and inspect `[Gather badge]` browser/worker warnings.
   A closed second device catches up on its next push or app opening.

The inbox shows the latest 200 messages; selected-message lookup covers 30 days
and availability depends on ntfy retention. Device push and badge support depend
on the browser and operating system. See [Notifications](notifications.md).

## Widget data is missing or shows N/A

Check reachability from the Gather container, the widget type, base URL, API
credentials, permissions, and TLS trust. A service working in your browser does
not prove the server can query its API. Source validation does not test these
connections. Missing fields can also reflect firmware/version differences.

For [NerdAxe](../widgets/services/nerdaxe.md), use `type: nerdaxe` for pool `pingRtt`
and rejected-share percentage. [Bitaxe](../widgets/services/bitaxe.md) uses share
response latency and hardware error percentage. These measurements are different;
unsupported fields intentionally show `N/A`. Explicitly disconnected NerdAxe
pools also show `N/A` for ping.

For [vCenter](administration.md#vcenter), check the configured read-only account
and trusted CA. Unavailable metrics do not imply zero utilization. Confirm live
compatibility against the server version rather than relying on local previews.

## Lost configuration, users, or personal dashboards after replacement

Inspect the persistent mounts and their ownership before editing anything.
Account preferences, users, personal workspaces, and encrypted variables live in
hidden SQLite files under the configuration directory. Replacing a container
without the original mount can make an instance appear empty.

Use the [backup inventory and restoration guide](operations.md) to restore the
complete state. Do not initialize replacement encrypted stores over a missing or
corrupt store, and do not restore only one of the three system databases.
