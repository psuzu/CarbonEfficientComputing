"""Green-window search utilities for carbon-aware scheduling."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from inputs.carbonsignal import (
    DEFAULT_OUTPUT_PATH,
    load_carbon_signal_csv,
    signal_values,
)
from modeling.timeslots import (
    allocate,
    check_fit,
    get_timeslot_info,
    make_capacity_array,
    reset_capacity,
)


@dataclass(frozen=True)
class GreenWindow:
    """A feasible scheduling window ranked by carbon quality."""

    start_hour: int
    runtime_hours: int
    avg_carbon_intensity: float
    total_carbon_cost: float

    def __lt__(self, other: "GreenWindow") -> bool:
        """Sort greener windows first."""

        return self.avg_carbon_intensity < other.avg_carbon_intensity


def _load_carbon_values(carbon_signal_path: str | Path) -> list[float]:
    """Load the hourly carbon-intensity forecast as plain floats."""

    return signal_values(load_carbon_signal_csv(carbon_signal_path))


def find_all_green_windows(
    runtime_hours: int,
    requested_cpus: int,
    carbon_signal_path: str | Path = DEFAULT_OUTPUT_PATH,
    capacity: list[int] | None = None,
) -> list[GreenWindow]:
    """Return every feasible window sorted from greenest to dirtiest."""

    carbon_values = _load_carbon_values(carbon_signal_path)
    horizon = len(carbon_values)
    windows: list[GreenWindow] = []

    for start_hour in range(horizon - runtime_hours + 1):
        if not check_fit(start_hour, runtime_hours, requested_cpus, capacity=capacity):
            continue

        window_values = carbon_values[start_hour : start_hour + runtime_hours]
        windows.append(
            GreenWindow(
                start_hour=start_hour,
                runtime_hours=runtime_hours,
                avg_carbon_intensity=sum(window_values) / runtime_hours,
                total_carbon_cost=sum(window_values),
            )
        )

    return sorted(windows)


def schedule_greenest_window(
    runtime_hours: int,
    requested_cpus: int,
    carbon_signal_path: str | Path = DEFAULT_OUTPUT_PATH,
    capacity: list[int] | None = None,
) -> GreenWindow | None:
    """Allocate capacity for the greenest feasible window."""

    windows = find_all_green_windows(
        runtime_hours=runtime_hours,
        requested_cpus=requested_cpus,
        carbon_signal_path=carbon_signal_path,
        capacity=capacity,
    )
    if not windows:
        return None

    best_window = windows[0]
    allocate(
        best_window.start_hour,
        runtime_hours,
        requested_cpus,
        capacity=capacity,
    )
    return best_window


def get_top_n_green_windows(
    runtime_hours: int,
    requested_cpus: int,
    n: int = 5,
    carbon_signal_path: str | Path = DEFAULT_OUTPUT_PATH,
    capacity: list[int] | None = None,
) -> list[GreenWindow]:
    """Return the top N greenest options without allocating them."""

    return find_all_green_windows(
        runtime_hours=runtime_hours,
        requested_cpus=requested_cpus,
        carbon_signal_path=carbon_signal_path,
        capacity=capacity,
    )[:n]


def calculate_carbon_savings(
    immediate_window: GreenWindow,
    green_window: GreenWindow,
) -> dict[str, float]:
    """Compare an immediate start against a greener delayed window."""

    absolute_savings = (
        immediate_window.avg_carbon_intensity - green_window.avg_carbon_intensity
    )
    percentage_savings = 0.0
    if immediate_window.avg_carbon_intensity > 0:
        percentage_savings = (
            absolute_savings / immediate_window.avg_carbon_intensity
        ) * 100

    total_savings = (
        immediate_window.total_carbon_cost - green_window.total_carbon_cost
    )
    return {
        "avg_carbon_savings_gco2_kwh": absolute_savings,
        "percent_savings": percentage_savings,
        "total_carbon_savings_gco2": total_savings,
    }


def get_enriched_schedule(
    carbon_signal_path: str | Path = DEFAULT_OUTPUT_PATH,
    capacity: list[int] | None = None,
) -> list[dict[str, int | float | str | None]]:
    """Combine time-slot availability and carbon intensity for visualization."""

    timeslot_rows = get_timeslot_info(capacity=capacity, start_time=datetime.now())
    carbon_points = load_carbon_signal_csv(carbon_signal_path)

    enriched: list[dict[str, int | float | str | None]] = []
    for slot, carbon_point in zip(timeslot_rows, carbon_points):
        enriched.append(
            {
                "hour_index": slot.hour_index,
                "timestamp": (
                    slot.timestamp.isoformat()
                    if slot.timestamp
                    else carbon_point.timestamp.isoformat()
                ),
                "available_cpus": slot.available_cpus,
                "carbon_intensity": carbon_point.carbon_signal_gco2_per_kwh,
            }
        )
    return enriched


if __name__ == "__main__":
    print("=" * 60)
    print("GREEN WINDOW SCHEDULER - DEMO")
    print("=" * 60)

    print("\n1. Finding the greenest window for a 6-hour, 200 CPU job...")
    best_window = schedule_greenest_window(runtime_hours=6, requested_cpus=200)

    if best_window:
        print(f"   Scheduled at hour {best_window.start_hour}")
        print(f"     Duration: {best_window.runtime_hours} hours")
        print(f"     Avg carbon: {best_window.avg_carbon_intensity:.2f} gCO2/kWh")
        print(f"     Total carbon: {best_window.total_carbon_cost:.2f} gCO2")
    else:
        print("   No available capacity")

    print("\n2. Top 5 greenest windows:")
    reset_capacity()
    for index, window in enumerate(
        get_top_n_green_windows(runtime_hours=6, requested_cpus=200, n=5),
        start=1,
    ):
        print(
            f"   {index}. Hour {window.start_hour:2d}: "
            f"{window.avg_carbon_intensity:6.2f} gCO2/kWh "
            f"(total: {window.total_carbon_cost:.2f} gCO2)"
        )

    print("\n3. Comparing scheduling strategies...")
    reset_capacity()
    immediate_capacity = make_capacity_array()
    green_capacity = make_capacity_array()

    if check_fit(0, 6, 200, capacity=immediate_capacity):
        carbon_values = _load_carbon_values(DEFAULT_OUTPUT_PATH)
        immediate_window = GreenWindow(
            start_hour=0,
            runtime_hours=6,
            avg_carbon_intensity=sum(carbon_values[0:6]) / 6,
            total_carbon_cost=sum(carbon_values[0:6]),
        )
        green_window = schedule_greenest_window(
            runtime_hours=6,
            requested_cpus=200,
            capacity=green_capacity,
        )

        if green_window:
            savings = calculate_carbon_savings(immediate_window, green_window)
            print(
                f"   Immediate (hour 0): "
                f"{immediate_window.avg_carbon_intensity:.2f} gCO2/kWh"
            )
            print(
                f"   Green (hour {green_window.start_hour}): "
                f"{green_window.avg_carbon_intensity:.2f} gCO2/kWh"
            )
            print(
                f"   Savings: {savings['avg_carbon_savings_gco2_kwh']:.2f} gCO2/kWh "
                f"({savings['percent_savings']:.1f}%)"
            )
            print(
                f"   Total carbon avoided: "
                f"{savings['total_carbon_savings_gco2']:.2f} gCO2"
            )

    print("\n" + "=" * 60)


__all__ = [
    "GreenWindow",
    "calculate_carbon_savings",
    "find_all_green_windows",
    "get_enriched_schedule",
    "get_top_n_green_windows",
    "schedule_greenest_window",
]
