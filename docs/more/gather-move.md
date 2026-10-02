---
title: Gather Configuration Migration
description: Preparing an existing dashboard for Gather configuration names
---

Gather uses `GATHER_*` runtime settings, `gather.*` Docker discovery labels,
`gather.daredevilbear.dev/*` Kubernetes annotations, and the
`/api/auth/callback/gather-oidc` SSO callback.

Existing installations must migrate configuration and encrypted variables before
upgrading. The repository provides an offline helper that previews changes,
rejects collisions, backs up changed files, and re-encrypts managed variables with
their new names. It preserves account subjects and personal dashboard ownership.

Follow the complete [configuration migration](https://github.com/daredevilbear/gather#configuration-migration)
in the Gather README, including backup, callback registration, shared-password
account preservation, restart and verification steps. Stop all writers before
applying the migration. A rollback must restore both the previous image and its
matching state backup.

For help, use [Gather documentation](https://gather.daredevilbear.dev/).
