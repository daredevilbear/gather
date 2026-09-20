# Gather

A self-hosted dashboard bringing service integrations, account controls,
notifications, and visual configuration into one application.

Gather is based on [Homepage](https://github.com/gethomepage/homepage).
It is in early development and is not yet a completed integrated release.

## Development milestones

1. Preserve the existing dashboard features while integrating account controls,
   a notification inbox, saved preferences, and Web Push into native components.
2. Add visual editing for services, bookmarks, widgets, settings, and custom styles.
3. Validate installation, upgrades, accessibility, and documentation for public use.

See the [migration plan](docs/development/integrated-dashboard.md) for acceptance
criteria. The current source baseline is Homepage v2.4.0; inherited usage and
build documentation is retained in [README.upstream.md](README.upstream.md).

Branding, domains, account providers, and notification connections will be
configurable. Personal deployment configuration and credentials do not belong
in this repository.

## Configuration editor

The administrator-only [settings editor](docs/gather/settings.md) supports dashboard
configuration, services, bookmarks, widgets, notification preferences, custom code,
and versioned backup/restore. Enable it explicitly in deployment configuration.

## License and upstream

This derivative retains Homepage's [GPL-3.0 license](LICENSE) and upstream
notices. Homepage UI is a feature reference for the planned editor; no editor
source has been incorporated. Upstream updates should be reviewed and tested
before merging into Gather.
