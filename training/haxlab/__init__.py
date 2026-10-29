"""Bundled HaxLab trainer, isolated from an installed replay-platform package.

This must be a regular package: a namespace package loses import resolution to
HaxLab's installed ``haxlab`` package, which does not provide ``baseline``.
"""
