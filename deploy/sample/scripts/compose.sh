#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -f compose.isolated.yaml ]; then
  exec docker compose -f compose.yaml -f compose.local.yaml -f compose.isolated.yaml "$@"
fi
exec docker compose -f compose.yaml -f compose.local.yaml "$@"
