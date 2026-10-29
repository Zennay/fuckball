#!/usr/bin/env python3
"""Regression test for an installed haxlab package shadowing the bundled trainer."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TRAINING = ROOT / "training"
LOCAL_PACKAGE = TRAINING / "haxlab"


def main() -> None:
    assert (LOCAL_PACKAGE / "__init__.py").is_file(), (
        "training/haxlab must remain a regular package"
    )
    assert (LOCAL_PACKAGE / "baseline.py").is_file(), (
        "bundled HaxLab baseline trainer is missing"
    )

    # Reproduce HaxLab's installed regular package appearing later on sys.path.
    # Without the local package marker, Python can select this installed package
    # and then fail to find the bundled haxlab.baseline module.
    with tempfile.TemporaryDirectory(prefix="fuckball-haxlab-shadow-") as temp:
        installed_root = Path(temp) / "site-packages"
        installed_package = installed_root / "haxlab"
        installed_package.mkdir(parents=True)
        (installed_package / "__init__.py").write_text(
            'ORIGIN = "installed-haxlab"\n', encoding="utf-8"
        )

        smoke = r"""
import sys
import types
from pathlib import Path

# Import resolution is the subject of this test, not NumPy's numerical code.
# A lightweight stub keeps the regression check dependency-free.
sys.modules.setdefault("numpy", types.ModuleType("numpy"))

import haxlab
from haxlab import baseline

expected = Path(sys.argv[1]).resolve()
assert Path(haxlab.__file__).resolve() == expected / "__init__.py", haxlab.__file__
assert Path(baseline.__file__).resolve() == expected / "baseline.py", baseline.__file__
assert not hasattr(haxlab, "ORIGIN"), "installed haxlab package shadowed bundled trainer"
print("HaxLab trainer package resolution: PASS")
"""
        env = os.environ.copy()
        env["PYTHONPATH"] = os.pathsep.join(
            (str(TRAINING), str(installed_root))
        )
        subprocess.run(
            [sys.executable, "-c", smoke, str(LOCAL_PACKAGE)],
            cwd=ROOT,
            env=env,
            check=True,
        )


if __name__ == "__main__":
    main()
