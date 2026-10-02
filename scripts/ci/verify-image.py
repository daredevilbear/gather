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
    predicate = provenance[platform]["SLSA"]
    # BuildKit changed both the field location and type URI for SLSA v1.
    # https://github.com/moby/buildkit/blob/master/docs/attestations/slsa-definitions.md
    if "buildDefinition" in predicate:
        assert predicate["buildDefinition"]["buildType"] == "https://github.com/moby/buildkit/blob/master/docs/attestations/slsa-definitions.md"
    else:
        assert predicate["buildType"] == "https://mobyproject.org/buildkit@v1"
    assert sbom[platform]["SPDX"]["spdxVersion"]
    print(f"{os.environ['IMAGE']}: {platform} source, version, license, provenance, and SBOM verified")
