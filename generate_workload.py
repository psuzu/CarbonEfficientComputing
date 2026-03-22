"""Backward-compatible wrapper for workload generation utilities."""

from inputs.generate_workload import *  # noqa: F403
from inputs.generate_workload import main as _main


if __name__ == "__main__":
    _main()
