"""Exercise registry metadata formats and reject incomplete release attestations."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class ImageVerificationTests(unittest.TestCase):
    def verify(self, version=1, invalid=None):
        configs, provenance, sbom = {}, {}, {}
        for platform in ("linux/amd64", "linux/arm64"):
            configs[platform] = {"config": {"Labels": {
                "org.opencontainers.image.revision": "a" * 40,
                "org.opencontainers.image.version": "1.0.0",
                "org.opencontainers.image.licenses": "GPL-3.0",
                "org.opencontainers.image.source": "https://github.com/example/gather",
            }}}
            build_type = ("https://github.com/moby/buildkit/blob/master/docs/attestations/slsa-definitions.md"
                          if version == 1 else "https://mobyproject.org/buildkit@v1")
            predicate = {"buildType": build_type}
            provenance[platform] = {"SLSA": {"buildDefinition": predicate} if version == 1 else predicate}
            sbom[platform] = {"SPDX": {"spdxVersion": "SPDX-2.3"}}
        if invalid == "revision":
            configs["linux/arm64"]["config"]["Labels"]["org.opencontainers.image.revision"] = "b" * 40
        if invalid == "sbom":
            del sbom["linux/arm64"]
        if invalid == "provenance":
            provenance["linux/amd64"] = {"SLSA": {}}
        if invalid == "build_type":
            provenance["linux/amd64"]["SLSA"]["buildDefinition"]["buildType"] = "https://example.com/other-builder"
        if invalid == "legacy_type_in_v1":
            provenance["linux/amd64"]["SLSA"]["buildDefinition"]["buildType"] = "https://mobyproject.org/buildkit@v1"
        with tempfile.TemporaryDirectory() as directory:
            files = []
            for index, data in enumerate((configs, provenance, sbom)):
                file = Path(directory) / f"{index}.json"
                file.write_text(json.dumps(data)); files.append(str(file))
            env = dict(os.environ, IMAGE="ghcr.io/example/gather", VERSION="1.0.0",
                       GITHUB_SHA="a" * 40, GITHUB_REPOSITORY="example/gather")
            return subprocess.run([sys.executable, str(Path(__file__).with_name("verify-image.py")), *files],
                                  env=env, capture_output=True, text=True)

    def test_accepts_slsa_v1(self):
        result = self.verify(); self.assertEqual(result.returncode, 0, result.stderr)

    def test_accepts_retained_slsa_v02(self):
        result = self.verify(version=0); self.assertEqual(result.returncode, 0, result.stderr)

    def test_rejects_other_source_revision_on_either_architecture(self):
        self.assertNotEqual(self.verify(invalid="revision").returncode, 0)

    def test_rejects_missing_sbom(self):
        self.assertNotEqual(self.verify(invalid="sbom").returncode, 0)

    def test_rejects_missing_buildkit_provenance(self):
        self.assertNotEqual(self.verify(invalid="provenance").returncode, 0)

    def test_rejects_other_builder(self):
        self.assertNotEqual(self.verify(invalid="build_type").returncode, 0)

    def test_rejects_legacy_type_uri_in_slsa_v1(self):
        self.assertNotEqual(self.verify(invalid="legacy_type_in_v1").returncode, 0)


if __name__ == "__main__":
    unittest.main()
