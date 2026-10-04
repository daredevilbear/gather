# Security

Security fixes target the latest Gather 1.0.x release. Development images are
intended for testing and may change before a stable release. Upgrade to the
latest supported patch version before reproducing an issue.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/daredevilbear/gather/security/advisories/new).
Do not put exploitable vulnerabilities, credentials, private hostnames, or user
data in public issues. Include the affected version/revision, a minimal sanitized
reproduction, impact, and any mitigation. Reporting availability is verified as
part of public release preparation; if GitHub reporting is unavailable, contact
the maintainer through their [GitHub profile](https://github.com/daredevilbear)
and request a private reporting channel before sharing sensitive details.

## Operate Gather securely

- Configure authentication, an exact external URL and allowed hosts, and HTTPS.
  OIDC provides distinct identities for named users; a shared password provides
  one shared identity. Do not expose an unauthenticated dashboard to the internet.
- Keep environment files, encryption keys, user databases, configuration backups,
  and notification/VAPID data outside source control. Preserve encryption keys
  separately from the data they protect.
- Treat administrator editing, custom JavaScript, and connected integration
  credentials as privileged access. A personal dashboard is not a separate
  authorization boundary for shared integrations.
- The notification companion needs authenticated same-origin routing and private
  persistent storage. Test Web Push on the intended installed app and device.
- The optional recovery controller has Docker authority when given a socket.
  Keep the socket and controller mounts out of the web application. Review the
  [system guide](https://gather.daredevilbear.dev/gather/system/) before enabling it.
- Pin image digests, back up state before upgrades, and test recovery in an
  isolated instance. SBOMs and provenance identify builds; they are not a security
  certification.

See [INSTALL.md](INSTALL.md) for authentication and persistence, and
[Operations](https://gather.daredevilbear.dev/gather/operations/) for backups.

## GameDig HTTP caching

Keep GameDig's outbound HTTP response caching disabled. This refers to the
Got HTTP client used by GameDig, including HTTP-based game protocols, rather
than browser caching or GameDig's game-server port cache.

Dependabot alert [#24](https://github.com/daredevilbear/gather/security/dependabot/24)
tracks [GHSA-ch52-4w7c-c8xp / CVE-2026-93748](https://github.com/advisories/GHSA-ch52-4w7c-c8xp).
The reviewed dependency chain is `gamedig 5.3.3 -> got 13.0.0 ->
cacheable-request 10.2.14 -> http-cache-semantics 4.2.0`. The advisory concerns
shared HTTP caches reusing restricted responses, including session cookies,
when a client supplies `Cache-Control: max-stale`.

The alert was dismissed as "Vulnerable code is not actually used" after a source
review on October 3, 2026: Got defaults to HTTP caching disabled, GameDig does not
enable it, and Gather neither forwards incoming request headers to GameDig nor
returns upstream headers or cookies. This is an assessment of the current usage,
not a patch to `http-cache-semantics` or a deployed-instance exploit test. The
advisory listed no patched release at review time.

`src/widgets/gamedig/proxy.http-cache.test.js` exercises the real GameDig HTTP
client against a local mock game server. It checks that repeated queries fetch
new responses, incoming cache directives and credentials are not forwarded, and
upstream cookies and raw data are not returned to dashboard clients.

Before enabling GameDig/Got HTTP caching, adding request-header forwarding, or
upgrading these dependencies, reassess this dismissal. A regression failure must
be investigated rather than bypassed. Before enabling caching, upgrade to an
officially fixed release or apply and test a reviewed fix; verify isolation of
authenticated responses and handling of `Set-Cookie` and `max-stale`. Upgrade
the affected dependency when an official fix becomes available.
