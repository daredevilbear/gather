#!/usr/bin/env bash
set -euo pipefail
image="${1:?Supply a container image}"
name="gather-ci-smoke-${RANDOM}"
cleanup() { docker rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT
# No ports, credentials, Docker socket or host data are exposed to the test app.
docker run -d --name "$name" --network none --cap-drop ALL \
  --security-opt no-new-privileges --user 1001:1001 \
  --tmpfs /app/config:rw,nosuid,nodev,uid=1001,gid=1001 \
  "$image" >/dev/null
for attempt in $(seq 1 40); do
  status="$(docker inspect --format '{{.State.Health.Status}}' "$name")"
  if [[ "$status" == healthy ]]; then
    docker exec "$name" node -e '
      (async () => {
        const health = await fetch("http://127.0.0.1:3000/api/healthcheck");
        if (!health.ok) process.exit(1);
        const settings = await fetch("http://127.0.0.1:3000/api/gather/system");
        if (settings.status !== 403) process.exit(1);
      })().catch(() => process.exit(1));'
    exit 0
  fi
  if [[ "$(docker inspect --format '{{.State.Running}}' "$name")" != true ]]; then break; fi
  sleep 2
done
docker logs --tail 40 "$name"
exit 1
