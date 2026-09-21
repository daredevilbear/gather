# Gather development workflow

- Use `dev` for ongoing development. Base feature branches on `dev` and target
  `dev` with pull requests.
- Reserve `main` for releases. Do not merge development into `main` or create a
  release tag until the user explicitly requests a release.
- Container channels are `dev` from `dev` and `latest` from `main`, for all three
  images. Keep immutable commit tags and version tags for traceability.
- Container publishing does not authorize deployment changes.
