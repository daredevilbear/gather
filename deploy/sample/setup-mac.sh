#!/bin/sh
set -eu
cd "$(dirname "$0")"
umask 077
test -f .env || cp env.example .env
chmod 600 .env
dc() { sh scripts/compose.sh "$@"; }
# Query the engine's Linux socket, rather than stat on the Mac socket.
# Detect it before Compose validation: the published manifest requires it even
# when only a setup helper is selected. Use only the pinned image, offline.
docker info > /dev/null
socket_gid=$(docker run --rm --network none --user 0:0 --entrypoint sh \
  -v /var/run/docker.sock:/engine.sock:ro \
  "${GATHER_IMAGE:?Export the released compatible image before running setup}" \
  -c "stat -c '%g' /engine.sock")
case "$socket_gid" in ''|*[!0-9]*) echo 'Cannot detect engine socket group' >&2; exit 1;; esac
export DOCKER_SOCKET_GID="$socket_gid"
dc --profile setup config --quiet
sed '/^DOCKER_SOCKET_GID=/d; /^GATHER_IMAGE=/d' .env > .env.setup.tmp
printf '\nDOCKER_SOCKET_GID=%s\nGATHER_IMAGE=%s\n' "$socket_gid" "$GATHER_IMAGE" >> .env.setup.tmp
mv .env.setup.tmp .env
# Keep locally built repair images local; pull only an absent declared image.
dc --profile setup config --images | sort -u | while IFS= read -r image; do
  docker image inspect "$image" > /dev/null 2>&1 || docker pull "$image"
done
dc --profile setup run --rm --no-deps initialize
dc --profile setup run --rm --no-deps ntfy-initialize
# Generated demo secret is read only by the mock publisher's service UID.
dc --profile setup run --rm --no-deps --entrypoint sh initialize -c 'chown 1001:1001 /setup/private/ntfy-publisher-password; chmod 600 /setup/private/ntfy-publisher-password'
dc up -d gateway
mkdir -p certs
# Caddy creates the local CA on first start. No Mac trust-store changes.
i=0
until dc exec -T gateway test -f /data/caddy/pki/authorities/local/root.crt; do
  i=$((i + 1)); test "$i" -lt 30 || exit 1; sleep 1
done
dc cp gateway:/data/caddy/pki/authorities/local/root.crt certs/root.crt
chmod 755 certs
chmod 644 certs/root.crt
dc --profile setup run --rm --no-deps --entrypoint sh initialize -c 'for f in settings services bookmarks widgets; do if [ ! -f /setup/private/demo-seeded ]; then cp /setup/sample-config/$f.yaml /setup/config/$f.yaml; chown 1001:1001 /setup/config/$f.yaml; chmod 600 /setup/config/$f.yaml; fi; done; touch /setup/private/demo-seeded'
dc up -d --wait --wait-timeout 240
if [ ! -f private/notifications-seeded ]; then
  dc --profile setup run --rm --no-deps seed-notifications
  touch private/notifications-seeded
fi
printf '\nDemo: https://localhost:8443 — choose a demo account at sign-in.\n'
