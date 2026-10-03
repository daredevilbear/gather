#!/bin/sh
# Create a fresh private copy of authored fixtures, never existing state/secrets.
set -eu
cd "$(dirname "$0")"
umask 077
root=$(mktemp -d "${TMPDIR:-/tmp}/gather-populated.XXXXXX")
id=$(basename "$root" | tr '[:upper:].' '[:lower:]-')
for file in compose.yaml compose.local.yaml env.example setup-mac.sh; do
  cp "$file" "$root/$file"
done
mkdir "$root/scripts"
cp scripts/compose.sh "$root/scripts/"
cp -R sample-config mock "$root/"
cat > "$root/compose.isolated.yaml" <<OVERLAY
name: gather-$id
services:
  gather:
    container_name: gather-$id-dashboard
  notifications:
    container_name: gather-$id-notifications
  gateway:
    container_name: gather-$id-gateway
  mock-services:
    container_name: gather-$id-mocks
  system-controller:
    container_name: gather-$id-controller
    command: [--root, /system-data, --app, gather-$id-dashboard, --notification, gather-$id-notifications, --gateway, gather-$id-gateway]
OVERLAY
printf 'Fresh private fixture directory: %s\n' "$root"
printf 'No containers started. Export GATHER_IMAGE with a compatible released digest, then run setup-mac.sh in this directory.\n'
