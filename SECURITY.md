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
