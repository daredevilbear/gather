# Contributing to Gather

Application changes target `dev`; `main` is reserved for releases. Follow `AGENTS.md` and the installed framework documentation.

The current [contribution guide](https://gather.daredevilbear.dev/contributing/) and [widget development reference](https://gather.daredevilbear.dev/widgets/authoring/) live on the Gather documentation site. Documentation changes belong in the separate [gather-docs repository](https://github.com/daredevilbear/gather-docs), targeting its `main` branch. Do not independently maintain duplicate guides under this repository's inherited `docs/` snapshot.

Report bugs and feature requests in [Gather Issues](https://github.com/daredevilbear/gather/issues). Questions belong in [Gather Discussions](https://github.com/daredevilbear/gather/discussions) once enabled. During staging, source and support are limited to authorized users. Include reproduction steps, expected behavior, image revision, and sanitized configuration; never include credentials or session cookies.

Run the tests relevant to your change and the checks required by CI. Widget changes should cover loading, errors, response mapping, and representative successful output, with a matching reference page in gather-docs.

Gather retains Homepage's GPL-3.0 license and upstream notices. Contributions are distributed under the repository's [license](LICENSE).
