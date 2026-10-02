"""Fail CI when the three images or a release tag disagree on source version."""
import json
import os
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[2]
version = (root / "VERSION").read_text().strip()
errors = []
if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version):
    errors.append("VERSION must contain a stable semantic version")
package = json.loads((root / "package.json").read_text())
if package["name"] != "gather" or package["version"] != version:
    errors.append("dashboard package name/version do not match Gather VERSION")
for context in (root, root / "notifications", root / "system"):
    if (context / "VERSION").read_text().strip() != version:
        errors.append(f"{context.name}/VERSION differs from {version}")
    defaults = re.findall(r"^ARG VERSION=(.+)$", (context / "Dockerfile").read_text(), re.M)
    if not defaults or any(default != version for default in defaults):
        errors.append(f"{context.name}/Dockerfile version defaults differ from {version}")
    for name in ("LICENSE", "NOTICE"):
        if (context / name).read_bytes() != (root / name).read_bytes():
            errors.append(f"{context.name}/{name} differs from the root notice")
ref = os.environ.get("GITHUB_REF", "")
if ref.startswith("refs/tags/") and ref != f"refs/tags/v{version}":
    errors.append(f"Release tag {ref} does not match v{version}")
if errors:
    sys.exit("\n".join(errors))
print(f"Gather dashboard, notifications, and controller agree on {version}")
