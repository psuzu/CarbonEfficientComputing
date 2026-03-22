"""Parallel CPU batch demo job."""

from __future__ import annotations

from multiprocessing import Pool


def work(_: int) -> int:
    total = 0
    for value in range(10_000_000):
        total += value * value
    return total


def parallel_job(num_workers: int = 4) -> list[int]:
    with Pool(num_workers) as pool:
        return pool.map(work, range(num_workers))


if __name__ == "__main__":
    parallel_job()
