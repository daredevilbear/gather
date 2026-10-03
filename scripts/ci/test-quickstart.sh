#!/bin/sh
# Test the delivered single Compose file; retain all state and use no host ports.
set -eu
cd "$(dirname "$0")/../.."
umask 077
root=$(mktemp -d "${TMPDIR:-/tmp}/gather-quickstart.XXXXXX")
id=$(basename "$root" | tr '[:upper:].' '[:lower:]-')
log="$root/validation.txt"
cp deploy/compose.quickstart.yaml "$root/compose.yaml"
image=$(docker image inspect "${1:?Supply a container image}" --format '{{.Id}}')
export GATHER_PROJECT="gather-$id" GATHER_IMAGE="$image" GATHER_DOMAIN=localhost
export GATHER_OIDC_ISSUER=https://identity.demo.local GATHER_OIDC_CLIENT_ID=gather-demo
export GATHER_OIDC_CLIENT_SECRET=fixture-client-secret GATHER_ADMIN_IDS=demo-admin
export GATHER_SUBNET=${GATHER_STANDALONE_SUBNET:-172.16.241.0/24}
export DOCKER_SOCKET_GID=$(docker run --rm --network none --entrypoint sh -v /var/run/docker.sock:/engine.sock:ro "$image" -c "stat -c '%g' /engine.sock")
cat > "$root/test.yaml" <<'YAML'
services:
  gateway:
    ports: !reset []
YAML
dc() { docker compose --project-directory "$root" -f "$root/compose.yaml" -f "$root/test.yaml" "$@"; }
cleanup() { dc down >/dev/null 2>&1 || true; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
{
 printf 'Private test data retained at: %s\nApp image ID: %s\n' "$root" "$image"
 dc --profile setup config --quiet
 dc --profile setup run --rm --no-deps initialize
 before=$(shasum -a 256 "$root/keys/"*.key "$root/system-data/"*/settings.sqlite)
 dc --profile setup run --rm --no-deps initialize
 after=$(shasum -a 256 "$root/keys/"*.key "$root/system-data/"*/settings.sqlite)
 test "$before" = "$after"
 echo 'Single-file first-use command is idempotent'
 dc --profile setup run --rm --no-deps ntfy-initialize
 dc up -d --wait --wait-timeout 240
 dc ps
 dc cp gateway:/data/caddy/pki/authorities/local/root.crt "$root/root.crt"
 chmod 644 "$root/root.crt"
 dc cp "$root/root.crt" gather:/tmp/lab-root.crt
 dc exec -T gather node -e 'const https=require("https"),fs=require("fs");https.get({hostname:"gateway",port:443,path:"/en",servername:"localhost",headers:{Host:"localhost"},ca:fs.readFileSync("/tmp/lab-root.crt")},r=>{console.log("Gateway verified TLS, protected app response:",r.statusCode,r.headers.location);process.exit(r.statusCode===307 && r.headers.location.startsWith("/auth/signin?")?0:1)}).on("error",e=>{console.error(e.message);process.exit(1)})'
 echo 'Standalone Compose: all five services running, app/companion/broker healthy; verified TLS gateway'
} > "$log" 2>&1 || { cat "$log"; exit 1; }
cat "$log"
