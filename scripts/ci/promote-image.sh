#!/usr/bin/env bash
set -euo pipefail
: "${IMAGE:?Supply IMAGE}"
: "${VERSION:?Supply VERSION}"
: "${GITHUB_SHA:?Supply source SHA}"
: "${GITHUB_REF:?Supply source ref}"

source_tag="$IMAGE:sha-$GITHUB_SHA"
digest="$(docker buildx imagetools inspect "$source_tag" --format '{{.Manifest.Digest}}')"
[[ "$digest" =~ ^sha256:[a-f0-9]{64}$ ]]

case "$GITHUB_REF" in
  refs/tags/v*)
    [[ "$GITHUB_REF" == "refs/tags/v$VERSION" ]]
    # Check the release version and source labels for each supported architecture.
    for platform in linux/amd64 linux/arm64; do
      config="$(docker buildx imagetools inspect "$IMAGE@$digest" --format "{{json (index .Image \"$platform\")}}")"
      python3 -c 'import json,sys; p=json.loads(sys.argv[1])["config"]["Labels"]; assert p["org.opencontainers.image.revision"] == sys.argv[2]; assert p["org.opencontainers.image.version"] == sys.argv[3]' "$config" "$GITHUB_SHA" "$VERSION"
    done
    version_tag="$IMAGE:$VERSION"
    if existing="$(docker buildx imagetools inspect "$version_tag" --format '{{.Manifest.Digest}}' 2>/tmp/version-error.txt)"; then
      [[ "$existing" == "$digest" ]] || { echo "Refusing to overwrite $version_tag" >&2; exit 1; }
    elif grep -Eiq 'manifest unknown|not found|404' /tmp/version-error.txt; then
      docker buildx imagetools create --tag "$version_tag" "$IMAGE@$digest"
    else
      cat /tmp/version-error.txt >&2; exit 1
    fi
    docker buildx imagetools create --tag "$IMAGE:${VERSION%.*}" "$IMAGE@$digest"
    ;;
  refs/heads/dev) docker buildx imagetools create --tag "$IMAGE:dev" "$IMAGE@$digest" ;;
  refs/heads/main) docker buildx imagetools create --tag "$IMAGE:latest" "$IMAGE@$digest" ;;
  *) echo "Unsupported publication ref" >&2; exit 1 ;;
esac
printf '%s@%s\n' "$IMAGE" "$digest" >> "${GITHUB_STEP_SUMMARY:-/dev/stdout}"
