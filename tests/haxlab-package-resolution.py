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


def run_smoke(training_root: Path, installed_root: Path, script: str, expected: Path) -> None:
    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join((str(training_root), str(installed_root)))
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    subprocess.run(
        [sys.executable, "-c", script, str(expected)],
        cwd=ROOT,
        env=env,
        check=True,
        timeout=15,
    )


def main() -> None:
    if not (LOCAL_PACKAGE / "__init__.py").is_file():
        raise AssertionError("training/haxlab must remain a regular package")
    if not (LOCAL_PACKAGE / "baseline.py").is_file():
        raise AssertionError("bundled HaxLab baseline trainer is missing")

    # Reproduce the original failure with a namespace package at the first path
    # and an installed regular package later on sys.path. Python must choose the
    # installed package, which cannot provide the bundled baseline module.
    with tempfile.TemporaryDirectory(prefix="fuckball-haxlab-shadow-") as temp:
        temp_root = Path(temp)
        installed_root = temp_root / "site-packages"
        installed_package = installed_root / "haxlab"
        installed_package.mkdir(parents=True)
        (installed_package / "__init__.py").write_text(
            'ORIGIN = "installed-haxlab"\n', encoding="utf-8"
        )

        namespace_training = temp_root / "namespace-training"
        namespace_package = namespace_training / "haxlab"
        namespace_package.mkdir(parents=True)
        (namespace_package / "baseline.py").write_text(
            '"""Bundled trainer placeholder used to reproduce import resolution."""\n',
            encoding="utf-8",
        )

        negative_smoke = r"""
import sys
from pathlib import Path

installed_package = Path(sys.argv[1]).resolve()
import haxlab
assert Path(haxlab.__file__).resolve() == installed_package / "__init__.py", haxlab.__file__
try:
    import haxlab.baseline
except ModuleNotFoundError as exc:
    assert exc.name == "haxlab.baseline", exc.name
    print("HaxLab package-shadowing regression reproduced without marker: PASS")
else:
    raise AssertionError("expected installed haxlab to hide the namespace trainer")
"""
        run_smoke(namespace_training, installed_root, negative_smoke, installed_package)

        # The fixed source tree has an explicit package marker, so its regular
        # package wins even when the installed package is present later on the
        # path. A NumPy stub keeps this check independent of numerical training.
        positive_smoke = r"""
import sys
import types
from pathlib import Path

sys.modules.setdefault("numpy", types.ModuleType("numpy"))
import haxlab
from haxlab import baseline

expected = Path(sys.argv[1]).resolve()
assert Path(haxlab.__file__).resolve() == expected / "__init__.py", haxlab.__file__
assert Path(baseline.__file__).resolve() == expected / "baseline.py", baseline.__file__
assert not hasattr(haxlab, "ORIGIN"), "installed haxlab package shadowed bundled trainer"
print("HaxLab trainer package resolution: PASS")
"""
        run_smoke(TRAINING, installed_root, positive_smoke, LOCAL_PACKAGE)

        # Exercise the actual CLI entry point with the installed-package
        # collision present, then inspect the modules it really imported. The
        # previous CLI smoke only checked argparse output and could pass without
        # proving that train.py resolved haxlab.baseline from the bundled tree.
        # Keep this bounded and import-only: --help exits before reading data,
        # training, or exporting a model.
        (installed_root / "numpy.py").write_text(
            '"""Import-only NumPy stub; this smoke test never trains."""\n',
            encoding="utf-8",
        )
        cli_cwd = temp_root / "cli-cwd"
        cli_cwd.mkdir()
        cli = subprocess.run(
            [
                sys.executable,
                "-c",
                r"""
import runpy
import sys
from pathlib import Path

training_root = Path(sys.argv[1]).resolve()
installed_root = Path(sys.argv[2]).resolve()
expected_package = Path(sys.argv[3]).resolve()
sys.path[:] = [
    str(training_root),
    str(installed_root),
    *[
        entry for entry in sys.path
        if entry not in {str(training_root), str(installed_root)}
    ],
]
sys.argv = [str(training_root / "train.py"), "--help"]
try:
    runpy.run_path(str(training_root / "train.py"), run_name="__main__")
except SystemExit as exc:
    if exc.code not in (None, 0):
        raise
else:
    raise AssertionError("trainer CLI --help did not exit normally")

import haxlab
from haxlab import baseline
assert Path(haxlab.__file__).resolve() == expected_package / "__init__.py", haxlab.__file__
assert Path(baseline.__file__).resolve() == expected_package / "baseline.py", baseline.__file__
assert not hasattr(haxlab, "ORIGIN"), "installed haxlab package shadowed trainer CLI"
print("HaxLab trainer CLI import provenance: PASS")
""",
                str(TRAINING),
                str(installed_root),
                str(LOCAL_PACKAGE),
            ],
            cwd=cli_cwd,
            env={
                **os.environ,
                "PYTHONPATH": os.pathsep.join((str(TRAINING), str(installed_root))),
                "PYTHONDONTWRITEBYTECODE": "1",
            },
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        if "--epochs" not in cli.stdout or "--data" not in cli.stdout:
            raise AssertionError("trainer CLI help omitted expected training options")
        if "HaxLab trainer CLI import provenance: PASS" not in cli.stdout:
            raise AssertionError("trainer CLI did not verify its imported package provenance")
        if (cli_cwd / "training" / "output").exists():
            raise AssertionError("trainer --help unexpectedly created a training output directory")
        if (cli_cwd / "dist" / "ai" / "trained-model.json").exists():
            raise AssertionError("trainer --help unexpectedly exported a model")
        print("HaxLab trainer CLI import provenance: PASS (no training or export side effects)")


if __name__ == "__main__":
    main()
