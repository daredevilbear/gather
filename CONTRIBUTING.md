# Contributing to Gather

Base application changes on `dev` and target `dev` with pull requests. `main` is
reserved for reviewed releases. Follow [AGENTS.md](AGENTS.md) and the framework
guides installed in `node_modules/next/dist/docs/` before changing Next.js code.

## Report an issue

Use [Gather Issues](https://github.com/daredevilbear/gather/issues) for bugs and
feature requests. Include steps to reproduce, expected and actual behavior, the
image version and source revision, and sanitized configuration. Remove tokens,
passwords, session cookies, user data, and private hostnames from logs and images.
Send confidential reports through the process in [SECURITY.md](SECURITY.md).

## Validate a change

Use Node.js 22.13 or newer and pnpm 11.19.0. CI runs:

```sh
pnpm install --frozen-lockfile
python3 scripts/ci/check-release.py
pnpm exec vitest run --pool forks --maxWorkers=4
python3 -m unittest discover -s system -p 'test_*.py'
node notifications/test-worker.cjs
```

CI also builds all three images, runs the notification tests in their image, and
smoke-tests dashboard startup and protected settings access. Run `pnpm lint`
and formatting checks for changed files. Widget changes should cover loading,
errors, response mapping, and representative successful output.

Describe the change, its reason, and the validation performed in the pull
request. Disclose substantial AI assistance. Never include local deployment
configuration, credentials, generated build output, or backup files.

## Documentation

The [contribution guide](https://gather.daredevilbear.dev/contributing/) and
[widget development reference](https://gather.daredevilbear.dev/widgets/authoring/)
live on the documentation site. Website changes belong in
[gather-docs](https://github.com/daredevilbear/gather-docs), targeting its `main`
branch. Keep this repository's README, install, security, and release instructions
consistent with the application. The inherited `docs/` tree is a source snapshot.

## License

Contributions are distributed under the repository's [GPL-3.0 license](LICENSE).
Retain Homepage attribution, existing copyright notices, and third-party license
notices. For release maintainers, see [RELEASING.md](RELEASING.md).
