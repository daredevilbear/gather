"""Reject installer payloads in the final, unprivileged Python runtime image."""
import importlib.util
from pathlib import Path
import shutil
import sysconfig


for module in ("pip", "ensurepip", "setuptools", "pkg_resources"):
    assert importlib.util.find_spec(module) is None, f"Unexpected runtime installer: {module}"

for command in ("pip", "pip3", "easy_install"):
    assert shutil.which(command) is None, f"Unexpected runtime installer command: {command}"

stdlib = Path(sysconfig.get_path("stdlib"))
assert not list(stdlib.rglob("*.whl")), "Bundled installer wheels remain in the runtime"
assert not list(stdlib.rglob("pip/_vendor/vendor.txt")), "Vendored pip dependencies remain"
print("Python runtime contains no package installers or bundled installer dependencies.")
