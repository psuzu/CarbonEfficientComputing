"""Pure Python CPU-burn demo job."""

from __future__ import annotations

import time


def cpu_burn(duration_seconds: float = 10.0) -> int:
    end_time = time.time() + duration_seconds
    total = 0
    while time.time() < end_time:
        for value in range(100_000):
            total += value * value
    return total


if __name__ == "__main__":
    cpu_burn()
