# Gather

Gather is a self-hosted dashboard that combines service integrations, visual
configuration, user accounts, personal dashboards, and notifications. It is
based on [Homepage](https://github.com/gethomepage/homepage), with native Gather
features built on the inherited dashboard and widget system.

**[Read the documentation](https://gather.daredevilbear.dev/gather/)** ·
[Set up Gather](https://gather.daredevilbear.dev/gather/setup/) ·
[Migrate from Homepage](https://gather.daredevilbear.dev/gather/migration/) ·
[Troubleshoot](https://gather.daredevilbear.dev/gather/troubleshooting/)

## What Gather includes

- A dashboard application bar with search, tabs, account controls, and an inbox.
- Visual editors for appearance, layouts, services, bookmarks, Home widgets,
  custom styles, and configuration backup/restore.
- Named users and roles, account preferences, and personal dashboards with
  view-only sharing for signed-in Gather users.
- Managed encrypted integration variables and protected system configuration
  with supervised authentication rollback.
- An optional notification companion for account-scoped read/dismiss state,
  Web Push, and installed-app badges.
- Homepage-compatible integrations plus Gather additions, including vCenter,
  Bitaxe, NerdAxe, Wazuh, and Velociraptor.

Gather remains in active development. Validate authentication, recovery, and
integrations in an isolated instance before adopting an update. The website provides one current documentation set; compare its release-note baseline
with your deployed image before upgrading.

## Documentation

The [Gather website](https://gather.daredevilbear.dev/) is the authoritative documentation source.
Documentation changes belong in [gather-docs](https://github.com/daredevilbear/gather-docs).
The website and both repositories remain private during staging; the site currently requires the approved reviewer account.
The inherited `docs/` files remain a source snapshot, not a second independently maintained guide.


| Task                                                      | Guide                                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| Install and configure authentication                      | [Setup](https://gather.daredevilbear.dev/gather/setup/)                      |
| Choose images and release channels                        | [Containers](https://gather.daredevilbear.dev/gather/containers/)            |
| Edit a shared dashboard                                   | [Settings](https://gather.daredevilbear.dev/gather/settings/)                |
| Manage users, personal dashboards, secrets, and migration | [Administration](https://gather.daredevilbear.dev/gather/administration/)    |
| Configure inbox and push delivery                         | [Notifications](https://gather.daredevilbear.dev/gather/notifications/)      |
| Configure encrypted connections and recovery              | [System settings](https://gather.daredevilbear.dev/gather/system/)           |
| Upgrade, back up, and restore                             | [Operations](https://gather.daredevilbear.dev/gather/operations/)            |
| Find integration configuration                            | [Widget reference](https://gather.daredevilbear.dev/widgets/services/) |

## Local UI development

Use Node.js 22.13 or newer and the repository's CI pnpm version (currently
11.19.0). From this checkout:

```sh
pnpm install --frozen-lockfile
pnpm dev:preview
```

Open [the settings preview](http://127.0.0.1:3022/preview/settings). It uses
isolated sample data and refreshes as source changes. See
[Local interface preview](https://gather.daredevilbear.dev/gather/local-preview/) for other preview routes
and their limits. Real OIDC sign-in, service connections, and device push need
separate integration checks.

Development changes target `dev`; `main` is reserved for releases. Successful
container builds publish `dev` or `latest`, respectively. Publishing an image
does not deploy it. See [Container builds](https://gather.daredevilbear.dev/gather/containers/).

## License and upstream

Gather retains Homepage's [GPL-3.0 license](LICENSE) and upstream notices.
The initial source baseline is Homepage v2.4.0. The inherited
[README](README.upstream.md) and configuration/widget references remain available;
start with Gather's guides for authentication, editing, accounts, and operations.
The [development plan](docs/development/integrated-dashboard.md) records the
integration goals. Deployment credentials and personal configuration belong
outside this repository.
