#!/bin/sh
set -eu
# Builds only a tiny helper fixture; it never connects to a live Gather installation.
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
fixture=$(mktemp -d)
name="gather-backup-test-$(date +%s)-$$"
cleanup() {
  docker rm -f "$name-app" "$name-notifications" >/dev/null 2>&1 || true
  docker image rm "$name-helper" "$name-controller" >/dev/null 2>&1 || true
  rm -rf "$fixture"
}
trap cleanup EXIT INT TERM
chmod 777 "$fixture"
mkdir "$fixture/context"
cp "$root/system/full-backup.cjs" "$root/system/vault.cjs" "$root/system/database.cjs" "$root/scripts/ci/backup-fixture.cjs" "$root/VERSION" "$fixture/context/"
cat > "$fixture/context/Dockerfile" <<'DOCKER'
FROM node:22-alpine
WORKDIR /app
COPY full-backup.cjs vault.cjs database.cjs /app/system/
COPY backup-fixture.cjs /tests/fixture.cjs
COPY VERSION /usr/share/gather/VERSION
USER 1001:1001
CMD ["node","-e","process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},10000)"]
DOCKER
docker build -q -t "$name-helper" "$fixture/context" >/dev/null
docker build -q -t "$name-controller" "$root/system" >/dev/null
socket_gid=$(docker run --rm --user 0 -v /var/run/docker.sock:/var/run/docker.sock --entrypoint stat "$name-controller" -c %g /var/run/docker.sock)
# Match production UID and socket group, so Linux file ownership is exercised.
# Only generated synthetic secrets are ever mounted here.
docker run --rm -v "$fixture:/fixture" "$name-helper" node /tests/fixture.cjs initialize
docker run -d --name "$name-app" -v "$fixture/config:/app/config" -v "$fixture/system:/system-data" -v "$fixture/keys/app.key:/run/secrets/gather-app-key:ro" -v "$fixture/keys/notification.key:/run/secrets/gather-notification-key:ro" "$name-helper" >/dev/null
docker run -d --name "$name-notifications" -v "$fixture/system/notification:/vault:ro" -v "$fixture/config:/config:ro" -v "$fixture/push:/data" -v "$fixture/keys/notification.key:/run/secrets/gather-notification-key:ro" "$name-helper" >/dev/null
tick() {
  docker run --rm --user 1001:1001 --group-add "$socket_gid" --network none -v /var/run/docker.sock:/var/run/docker.sock -v "$fixture/system:/system-data" --entrypoint python "$name-controller" -B -c "from controller import Controller; c=Controller('/system-data','$name-app','$name-notifications','unused-gateway'); c.ready=lambda:True; c.tick()"
}
fixture_action() { docker run --rm -v "$fixture:/fixture" "$name-helper" node /tests/fixture.cjs "$1"; }
tick
fixture_action inspect
tick
fixture_action restore
tick
fixture_action expire
tick
fixture_action verify
