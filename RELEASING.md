# Releasing Gather

## Versions and channels

Develop on `dev`; merge a reviewed release from `dev` into `main`. Keep
`package.json`, root `VERSION`, both companion `VERSION` files, Dockerfile version
defaults, `NOTICE` copies, and release documentation in agreement. The dashboard,
notification companion, and optional controller share one Gather release version.
`package.json` stays `private` because Gather is distributed as source/containers,
not an npm package.

Use annotated `vMAJOR.MINOR.PATCH` Git tags on `main`. Homepage tags inherited by a
local checkout are not Gather releases; do not push them with `--tags`. Gather's
initial baseline remains documented by commit in `NOTICE` and README.upstream.md.

- `dev` images come from `dev`; `latest` images come from `main`.
- `sha-<full SHA>` tags are created once. Reruns reuse the existing source digest.
- Version tags promote the already verified main source digest, preserving its
  SBOM and provenance, and refuse to overwrite an existing different digest.
- Minor aliases such as `1.0` can advance. Tagging an older release does not move
  `latest`. Prefer immutable digests for installs.

## Protections

Apply `.github/branch-protection.json` to both `dev` and `main`. It requires pull
requests, current-branch status checks supplied by GitHub Actions (app ID 15368),
resolved review conversations, and enforcement for administrators; it blocks force
pushes and deletion. The actual check names are:

- `Application and security tests`
- `Build app`
- `Build notifications`
- `Build system-controller`

The approval count is zero for the current single-maintainer repository, while
pull requests and all CI checks remain required. Increase it when independent
reviewers are available. Do not require publish jobs on pull requests: publishing
is deliberately skipped there. Apply `.github/release-tag-ruleset.json` to prevent
release tag updates/deletion. The restricted Actions allowlist is maintained in
repository settings; third-party actions require a reviewed allowlist change.

```sh
for branch in dev main; do
  gh api --method PUT "repos/daredevilbear/gather/branches/$branch/protection" \
    --input .github/branch-protection.json
done
# Create once; update the matching ruleset ID on later changes.
gh api --method POST repos/daredevilbear/gather/rulesets \
  --input .github/release-tag-ruleset.json
```

GitHub Free cannot enable these protections on a private repository. Keep public
visibility pending review; a GitHub Pro upgrade also enables private protection.
Verify the applied API responses rather than treating these files as active rules.

## Release procedure

1. Back up every local/remote ref, linked worktree state, and uncommitted work
   outside the repository. Restrict backup permissions and test restoration.
   Audit all reachable history, source, image layers, SBOM/provenance, and release
   attachments for credentials, private deployments, and unintended files.
2. Incorporate pending work into `dev`, align versions, update `CHANGELOG.md`,
   `INSTALL.md`, README and security/contribution guidance, and run validation.
   Keep GPL notices and upstream attribution in all build contexts.
3. Push `dev` and open a release pull request from `dev` to `main`. Wait for all
   four actual CI checks on the current PR head. Merge with a merge commit, then
   wait for all three main multi-platform image publications.
4. Create the annotated release tag on that main commit and push only that tag.
   The tag workflow must pass before publication. Record source SHA, all three
   image digests, supported platforms, revision/version labels, SBOM, and
   provenance in the draft GitHub release.
5. Review the exact source/history and release artifacts before approving public
   exposure. Repository visibility and each GHCR package's visibility are
   separate settings. Enable private vulnerability reporting, branch/tag
   protections, and verify anonymous image access before publishing the release.
   Update the public website separately through gather-docs if needed.
6. Remove backed-up obsolete branches after their changes are merged or documented
   as superseded. Keep only `dev` and `main`. Leave global automatic deletion
   disabled so a release merge cannot remove `dev`; delete feature branches
   explicitly after reviewing them.

Release preparation and container publication do not deploy the application or
change existing proxy, tunnel, DNS, or documentation infrastructure.

## History cleanup and collaborator recovery

For 1.0, retain Homepage and Gather commit history. The reviewed scanner matches
are synthetic authentication/MCP test fixtures and an example authorization
header; they do not justify rewriting contributor history. Remove stale branch
refs and inherited local Homepage tags after a verified private backup. No
remote commit IDs are rewritten. Older branch-only merge commits and duplicate
documentation edits are backed up; preserve useful policy text in release docs.

Collaborators should save their work before pruning, then run:

```sh
git fetch origin --prune
git switch dev
git pull --ff-only
```

Do not repush removed Homepage tags or archived feature branches. A branch can be
recovered by cloning the protected `all-refs.bundle` and checking out its recorded
ref. If a future security finding requires rewriting, document old/new ref maps,
rotation/removal steps, and fresh-clone instructions before any approved force
push. Never publish the private backup or audit reports as release attachments.
