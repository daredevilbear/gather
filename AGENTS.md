# Gather development workflow

- Use `dev` for ongoing development. Base feature branches on `dev` and target
  `dev` with pull requests.
- Reserve `main` for releases. Do not merge development into `main` or create a
  release tag until the user explicitly requests a release.
- Container channels are `dev` from `dev` and `latest` from `main`, for all three
  images. Keep immutable commit tags and version tags for traceability.
- Container publishing does not authorize deployment changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
