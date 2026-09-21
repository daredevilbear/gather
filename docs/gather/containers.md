# Container builds

`.github/workflows/containers.yml` validates pull requests and builds three images.
Pushes to `dev` and `main` publish only after the full test suite and all image builds pass.
No deployment is performed by this workflow.

| Image | Purpose |
| --- | --- |
| `ghcr.io/daredevilbear/gather` | Dashboard and settings interface |
| `ghcr.io/daredevilbear/gather-notifications` | Notification and Web Push companion |
| `ghcr.io/daredevilbear/gather-system-controller` | Optional privileged recovery controller |

Published images support `linux/amd64` and `linux/arm64`. The workflow uses the
repository owner's namespace, so a fork can publish to its own account.

- `dev` follows successful builds of the `dev` branch.
- `latest` is the production channel and follows successful builds of `main`.
- `sha-<full commit SHA>` identifies a particular source revision.
- A `v1.2.3` tag produces `1.2.3` and `1.2` image tags. Tagged commits must
  belong to `main`. Version tags do not move `latest`, so tagging an older
  release cannot roll the production channel backward.
- A manual run validates by default. The optional publish checkbox only works
  when running against `dev` or `main`.

For deployment, prefer the immutable `image@sha256:...` digest recorded in the
workflow summary. Tags can move. BuildKit generates an SBOM and build provenance
with each published image; these are metadata, not an independent security audit.

## Development and releases

All development lands on `dev`; feature pull requests target `dev`. Keep `main`
for releases. When a version is ready, review and merge `dev` into `main`, wait
for the production pipeline to pass, then tag that main commit with its version.
The same channel rules apply to all three images. Neither channel deploys itself.

## Permissions and secrets

Actions are pinned to full commit SHAs. Checkout does not persist credentials.
Test and build jobs have read-only repository access. Only the publish job can
write packages, using the short-lived `GITHUB_TOKEN`; no registry password or
personal token needs to be stored as a repository secret. Pull requests never
log into the registry or publish images. The workflow does not use
`pull_request_target` or execute PR code with package-write credentials.

GHCR packages are initially private. This workflow does not change package or
repository visibility. Access and visibility can be managed separately when
Gather is ready for public distribution. The controller image does not itself
grant Docker access; deploying it with a Docker socket remains a separate,
explicit operator decision described in `system.md`.

## Validation

CI installs with the frozen pnpm lockfile, runs the entire Vitest suite,
recovery-controller transaction tests, push-worker tests and the notification
image's tests. All three images must build before publishing can begin. The app
smoke test runs without network access, exposed ports, host data or a Docker
socket; it checks startup health and unauthenticated system-settings denial.

To reproduce locally:

```sh
pnpm install --frozen-lockfile
pnpm exec vitest run --pool forks --maxWorkers=4
python3 -m unittest discover -s system -p 'test_*.py'
node notifications/test-worker.cjs
docker build -t gather:test .
bash scripts/ci/smoke-container.sh gather:test
```

Official references: [GitHub container publishing](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images)
and [Docker build attestations](https://docs.docker.com/build/ci/github-actions/attestations/).
