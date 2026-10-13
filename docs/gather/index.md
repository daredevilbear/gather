> Source snapshot: use the [public Gather documentation](https://gather.daredevilbear.dev/) and [repository installation guide](../../INSTALL.md) for the current release.

# Gather documentation

Gather brings dashboard services, visual configuration, accounts, personal
dashboards, and notifications together. These guides describe this fork;
Homepage-derived references cover the inherited YAML and integration formats.

## Start here

1. Follow [Setup](setup.md) for runtime, persistent configuration, authentication,
   and your first administrator.
2. Use [Settings](settings.md) to create tabs, groups, services, bookmarks, and
   Home widgets. Existing installations can follow
   [Import from Homepage](administration.md#homepage-migration).
3. Configure [users and personal dashboards](administration.md#users-roles-and-personal-dashboards),
   then add [notifications](notifications.md) if needed.
4. Establish [backups and an upgrade procedure](operations.md), and verify
   recovery before relying on the instance.

## Guides by task

| Guide                                    | Covers                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| [Setup](setup.md)                        | Runtime, sign-in, administrator bootstrap, first checks  |
| [Navigation](navigation.md)              | Application bar, tabs, search, account menu              |
| [Settings](settings.md)                  | Shared configuration, source editing, versioned saves    |
| [Administration](administration.md)      | Roles, personal dashboards, secrets, migration, vCenter  |
| [Notifications](notifications.md)        | Companion, ntfy, device push, badge behavior             |
| [Secure system configuration](system.md) | Encryption keys, connection changes, recovery controller |
| [Containers](containers.md)              | Image channels, CI, registry access, gateway recovery    |
| [Operations](operations.md)              | Upgrades, backup inventory, restoration, verification    |
| [Troubleshooting](troubleshooting.md)    | Sign-in, access, pulls, proxy, push, widget failures     |
| [Local preview](local-preview.md)        | Development samples and what they can verify             |

## Integration and configuration reference

Gather retains Homepage-style configuration keys, including `HOMEPAGE_*`
environment variables. Their names are compatibility interfaces, not an
instruction to run a separate Homepage instance.

- [Settings YAML](../configs/settings.md), [services](../configs/services.md),
  [bookmarks](../configs/bookmarks.md), and [Home widgets](../configs/info-widgets.md).
- [Service widget reference](../widgets/services/index.md) and
  [information widgets](../widgets/info/index.md).
- Gather guides for [Avalon Nano 3s](../widgets/services/avalonnano3s.md) (dev),
  [Bitaxe](../widgets/services/bitaxe.md),
  [NerdAxe / NerdQAxe](../widgets/services/nerdaxe.md),
  [Wazuh](../widgets/services/wazuh.md),
  [Velociraptor](../widgets/services/velociraptor.md), and
  [vCenter](administration.md#vcenter).

Use Gather's setup and administration guides when inherited documentation differs
on deployment, authentication, accounts, or configuration editing. Personal
layouts organize shared integrations; they are not a separate authorization
boundary for the connected services.

## Versions and documentation hosting

These Markdown guides are hosted in the
[Gather GitHub repository](https://github.com/daredevilbear/gather/tree/dev/docs/gather).
The repository's branch selector changes the documentation version: `dev` follows
ongoing development and `main` follows releases. For an immutable reference,
browse the commit identified by your deployed image.

This documentation hub does not require GitHub Pages or a separate documentation
server. Repository access controls also govern access to the guides. Local copies
can be read directly from the same paths after cloning.

Gather is in active development. Device push delivery, accessibility, and external
service compatibility require testing in the intended environment; development
previews do not establish those results.
