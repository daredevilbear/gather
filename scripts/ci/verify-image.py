"""Verify both release architectures have matching source labels and attestations."""
import json
import os
import sys
from pathlib import Path

configs, provenance, sbom = (json.loads(Path(name).read_text()) for name in sys.argv[1:])
for platform in ("linux/amd64", "linux/arm64"):
    labels = configs[platform]["config"]["Labels"]
    assert labels["org.opencontainers.image.revision"] == os.environ["GITHUB_SHA"]
    assert labels["org.opencontainers.image.version"] == os.environ["VERSION"]
    assert labels["org.opencontainers.image.licenses"] == "GPL-3.0"
    assert labels["org.opencontainers.image.source"] == f"https://github.com/{os.environ['GITHUB_REPOSITORY']}"
    assert provenance[platform]["SLSA"]["buildType"]
    assert sbom[platform]["SPDX"]["spdxVersion"]
    print(f"{os.environ['IMAGE']}: {platform} source, version, license, provenance, and SBOM verified")
