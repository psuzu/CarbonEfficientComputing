"""Matrix multiplication demo job."""

from __future__ import annotations

import time

import numpy as np


def cpu_heavy_job(duration_seconds: float = 10.0, matrix_size: int = 500) -> float:
    end_time = time.time() + duration_seconds
    checksum = 0.0
    while time.time() < end_time:
        left = np.random.rand(matrix_size, matrix_size)
        right = np.random.rand(matrix_size, matrix_size)
        checksum += float(np.dot(left, right)[0, 0])
    return checksum


if __name__ == "__main__":
    cpu_heavy_job()
