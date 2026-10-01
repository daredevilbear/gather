# Gather

Gather is a self-hosted dashboard that combines service integrations, visual
configuration, user accounts, personal dashboards, and notifications. It is
based on [Homepage](https://github.com/gethomepage/homepage), with native Gather
features built on the inherited dashboard and widget system.

**[Read the documentation](docs/gather/index.md)** ·
[Set up Gather](docs/gather/setup.md) ·
[Migrate from Homepage](docs/gather/administration.md#homepage-migration) ·
[Troubleshoot](docs/gather/troubleshooting.md)

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
integrations in an isolated instance before adopting an update. Documentation on
`dev` follows development; use the same branch or commit as your deployed image.

## Documentation

| Task                                                      | Guide                                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| Install and configure authentication                      | [Setup](docs/gather/setup.md)                      |
| Choose images and release channels                        | [Containers](docs/gather/containers.md)            |
| Edit a shared dashboard                                   | [Settings](docs/gather/settings.md)                |
| Manage users, personal dashboards, secrets, and migration | [Administration](docs/gather/administration.md)    |
| Configure inbox and push delivery                         | [Notifications](docs/gather/notifications.md)      |
| Configure encrypted connections and recovery              | [System settings](docs/gather/system.md)           |
| Upgrade, back up, and restore                             | [Operations](docs/gather/operations.md)            |
| Find integration configuration                            | [Widget reference](docs/widgets/services/index.md) |

## Local UI development

Use Node.js 22.13 or newer and the repository's CI pnpm version (currently
11.19.0). From this checkout:

```sh
pnpm install --frozen-lockfile
pnpm dev:preview
```

Open [the settings preview](http://127.0.0.1:3022/preview/settings). It uses
isolated sample data and refreshes as source changes. See
[Local interface preview](docs/gather/local-preview.md) for other preview routes
and their limits. Real OIDC sign-in, service connections, and device push need
separate integration checks.

Development changes target `dev`; `main` is reserved for releases. Successful
container builds publish `dev` or `latest`, respectively. Publishing an image
does not deploy it. See [Container builds](docs/gather/containers.md).

## License and upstream

Gather retains Homepage's [GPL-3.0 license](LICENSE) and upstream notices.
The initial source baseline is Homepage v2.4.0. The inherited
[README](README.upstream.md) and configuration/widget references remain available;
start with Gather's guides for authentication, editing, accounts, and operations.
The [development plan](docs/development/integrated-dashboard.md) records the
integration goals. Deployment credentials and personal configuration belong
outside this repository.
