"""Time-slot capacity helpers for Layer 2."""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timedelta

DEFAULT_HORIZON_HOURS = 48
DEFAULT_CAPACITY_PER_HOUR = 1000

@dataclass(frozen=True)
class TimeSlot:
    """Represents a single hour timeslot with capacity info."""
    
    hour_index: int
    timestamp: datetime | None
    available_cpus: int
    
    def to_dict(self) -> dict[str, int | str | None]:
        return {
            "hour_index": self.hour_index,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "available_cpus": self.available_cpus,
        }

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

def make_timeslot_array(
    horizon_hours: int = DEFAULT_HORIZON_HOURS,
    capacity: int = DEFAULT_CAPACITY_PER_HOUR,
    start_time: datetime | None = None,
) -> list[TimeSlot]:
    """
    Create an array of TimeSlot objects with timestamps and capacity.
    
    Args:
        horizon_hours: Number of hours in the planning horizon
        capacity: CPU capacity per hour
        start_time: Optional starting timestamp (hour 0)
    
    Returns:
        List of TimeSlot objects representing each hour
    """
    slots = []
    for hour in range(horizon_hours):
        timestamp = start_time + timedelta(hours=hour) if start_time else None
        slots.append(
            TimeSlot(
                hour_index=hour,
                timestamp=timestamp,
                available_cpus=capacity,
            )
        )
    return slots


def get_timeslot_info(
    capacity: list[int] | None = None,
    start_time: datetime | None = None,
) -> list[TimeSlot]:
    """
    Convert capacity array to TimeSlot objects with current state.
    
    Args:
        capacity: Optional capacity array (uses global if None)
        start_time: Optional starting timestamp for hour 0
    
    Returns:
        List of TimeSlot objects reflecting current capacity state
    """
    target_capacity = _resolve_capacity(capacity)
    slots = []
    
    for hour_index, available_cpus in enumerate(target_capacity):
        timestamp = start_time + timedelta(hours=hour_index) if start_time else None
        slots.append(
            TimeSlot(
                hour_index=hour_index,
                timestamp=timestamp,
                available_cpus=available_cpus,
            )
        )
    
    return slots

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
    "TimeSlot",
    "allocate",
    "capacity_array",
    "check_fit",
    "get_timeslot_info",
    "make_capacity_array",
    "make_timeslot_array",
    "reset_capacity",
]