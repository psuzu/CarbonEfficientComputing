"""Layer 2 – Time-slot capacity helpers (standalone)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta

DEFAULT_HORIZON_HOURS = 48
DEFAULT_CAPACITY_PER_HOUR = 1000

capacity_array: list[int] = [DEFAULT_CAPACITY_PER_HOUR] * DEFAULT_HORIZON_HOURS


def make_capacity_array(
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
    capacity: int = DEFAULT_CAPACITY_PER_HOUR,
) -> list[int]:
    return [capacity] * horizon_hours


def _resolve(capacity: list[int] | None) -> list[int]:
    return capacity_array if capacity is None else capacity


def check_fit(
    start_hour: int,
    runtime_hours: int,
    requested_cpus: int,
    capacity: list[int] | None = None,
) -> bool:
    arr = _resolve(capacity)
    end = start_hour + runtime_hours
    if end > len(arr):
        return False
    return all(arr[h] >= requested_cpus for h in range(start_hour, end))


def allocate(
    start_hour: int,
    runtime_hours: int,
    requested_cpus: int,
    capacity: list[int] | None = None,
) -> list[int]:
    arr = _resolve(capacity)
    for h in range(start_hour, start_hour + runtime_hours):
        arr[h] -= requested_cpus
    return arr


def reset_capacity(
    capacity: int = DEFAULT_CAPACITY_PER_HOUR,
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
) -> list[int]:
    capacity_array[:] = make_capacity_array(horizon_hours=horizon_hours, capacity=capacity)
    return capacity_array


@dataclass(frozen=True)
class TimeslotInfo:
    hour_index: int
    available_cpus: int
    timestamp: datetime | None = None


def get_timeslot_info(
    capacity: list[int] | None = None,
    start_time: datetime | None = None,
) -> list[TimeslotInfo]:
    arr = _resolve(capacity)
    base = start_time or datetime.now()
    return [
        TimeslotInfo(hour_index=i, available_cpus=arr[i], timestamp=base + timedelta(hours=i))
        for i in range(len(arr))
    ]


__all__ = [
    "DEFAULT_CAPACITY_PER_HOUR",
    "DEFAULT_HORIZON_HOURS",
    "TimeslotInfo",
    "allocate",
    "capacity_array",
    "check_fit",
    "get_timeslot_info",
    "make_capacity_array",
    "reset_capacity",
]
