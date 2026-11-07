#!/bin/sh
set -eu
# Scan the resolved image filesystem, including OS packages, rather than only SBOM metadata.
image=${1:?image reference required}
report_dir=${2:?absolute report directory required}
case "$report_dir" in /*) ;; *) echo 'Report directory must be absolute' >&2; exit 1 ;; esac
scanner=ghcr.io/aquasecurity/trivy@sha256:8f6bb947dbc528902e11f2f5be52f7b519f6a39d5d148f41166f2040499768fb
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT INT TERM
mkdir -p "$report_dir" "$scratch/cache"
docker image save --output "$scratch/image.tar" "$image"
# The scanner receives no Docker socket, application data, or registry credentials.
docker run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges \
  --tmpfs /tmp:rw,nosuid,nodev \
  -v "$scratch/image.tar:/scan/image.tar:ro" \
  -v "$scratch/cache:/root/.cache/trivy" \
  -v "$report_dir:/results" \
  "$scanner" image --input /scan/image.tar --scanners vuln \
  --format json --output /results/vulnerabilities.json --exit-code 1
