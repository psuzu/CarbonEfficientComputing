"""Time-slot capacity helpers for Layer 2."""

from __future__ import annotations

DEFAULT_HORIZON_HOURS = 48
DEFAULT_CAPACITY_PER_HOUR = 1000


def make_capacity_array(
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
    capacity: int = DEFAULT_CAPACITY_PER_HOUR,
) -> list[int]:
    if not isinstance(horizon_hours, int) or horizon_hours < 1:
        raise ValueError(f"horizon_hours must be a positive int, got {horizon_hours}")
    if not isinstance(capacity, int) or capacity < 0:
        raise ValueError(f"capacity must be a non-negative int, got {capacity}")
    return [capacity] * horizon_hours


capacity_array = make_capacity_array()


def _resolve_capacity(capacity: list[int] | None) -> list[int]:
    return capacity_array if capacity is None else capacity


def _validate_request(
    capacity: list[int],
    start_hour: int,
    runtime_hours: int,
    requested_cpus: int,
) -> None:
    if not isinstance(start_hour, int) or start_hour < 0:
        raise ValueError(f"start_hour must be a non-negative int, got {start_hour}")
    if not isinstance(runtime_hours, int) or runtime_hours < 1:
        raise ValueError(f"runtime_hours must be a positive int, got {runtime_hours}")
    if not isinstance(requested_cpus, int) or requested_cpus < 1:
        raise ValueError(f"requested_cpus must be a positive int, got {requested_cpus}")

    end_hour = start_hour + runtime_hours
    if end_hour > len(capacity):
        raise ValueError(
            f"Requested window [{start_hour}, {end_hour}) exceeds "
            f"capacity horizon of {len(capacity)} hours"
        )


def check_fit(
    start_hour: int,
    runtime_hours: int,
    requested_cpus: int,
    capacity: list[int] | None = None,
) -> bool:
    target_capacity = _resolve_capacity(capacity)
    _validate_request(target_capacity, start_hour, runtime_hours, requested_cpus)
    end_hour = start_hour + runtime_hours
    return all(target_capacity[hour] >= requested_cpus for hour in range(start_hour, end_hour))


def allocate(
    start_hour: int,
    runtime_hours: int,
    requested_cpus: int,
    capacity: list[int] | None = None,
) -> list[int]:
    target_capacity = _resolve_capacity(capacity)
    _validate_request(target_capacity, start_hour, runtime_hours, requested_cpus)
    if not check_fit(start_hour, runtime_hours, requested_cpus, capacity=target_capacity):
        raise ValueError("Insufficient capacity for the requested allocation window")

    end_hour = start_hour + runtime_hours
    for hour in range(start_hour, end_hour):
        target_capacity[hour] -= requested_cpus
    return target_capacity


def reset_capacity(
    capacity: int = DEFAULT_CAPACITY_PER_HOUR,
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
) -> list[int]:
    capacity_array[:] = make_capacity_array(horizon_hours=horizon_hours, capacity=capacity)
    return capacity_array


__all__ = [
    "DEFAULT_CAPACITY_PER_HOUR",
    "DEFAULT_HORIZON_HOURS",
    "allocate",
    "capacity_array",
    "check_fit",
    "make_capacity_array",
    "reset_capacity",
]
