"""Green window scheduler for Layer 3 - Carbon-aware scheduling."""

from __future__ import annotations

from pathlib import Path
from dataclasses import dataclass
from inputs.carbonsignal import load_carbon_signal_csv, signal_values
# Import from carbon_signals (Layer 1)
# Import from timespots (Layer 2)
from modeling.timeslots import check_fit, allocate, make_capacity_array

@dataclass(frozen=True)
class GreenWindow:
    """Represents a schedulable time window with carbon metrics."""
    
    start_hour: int
    runtime_hours: int
    avg_carbon_intensity: float  # gCO2/kWh
    total_carbon_cost: float  # Total gCO2 for the window
    
    def __lt__(self, other: GreenWindow) -> bool:
        """Compare windows by average carbon intensity (for sorting)."""
        return self.avg_carbon_intensity < other.avg_carbon_intensity


def find_all_green_windows(
    runtime_hours: int,
    requested_cpus: int,
    carbon_signal_path: str | Path = CARBON_SIGNAL_PATH,
    capacity: list[int] | None = None,
) -> list[GreenWindow]:
    """
    Find all feasible scheduling windows ranked by carbon intensity.
    
    Args:
        runtime_hours: Duration of the job
        requested_cpus: CPUs required
        carbon_signal_path: Path to carbon signal CSV
        capacity: Optional capacity array (uses global if None)
    
    Returns:
        List of GreenWindow objects, sorted by carbon intensity (lowest first)
    """
    # Load carbon signal data
    carbon_points = load_carbon_signal_csv(carbon_signal_path)
    carbon_values = signal_values(carbon_points)
    horizon = len(carbon_values)
    
    # Find all feasible windows
    windows: list[GreenWindow] = []
    
    for start_hour in range(horizon - runtime_hours + 1):
        if check_fit(start_hour, runtime_hours, requested_cpus, capacity=capacity):
            # Calculate carbon metrics for this window
            window_values = carbon_values[start_hour : start_hour + runtime_hours]
            avg_carbon = sum(window_values) / runtime_hours
            total_carbon = sum(window_values)
            
            windows.append(
                GreenWindow(
                    start_hour=start_hour,
                    runtime_hours=runtime_hours,
                    avg_carbon_intensity=avg_carbon,
                    total_carbon_cost=total_carbon,
                )
            )
    
    # Sort by average carbon intensity (lowest first = greenest)
    return sorted(windows)


def schedule_greenest_window(
    runtime_hours: int,
    requested_cpus: int,
    carbon_signal_path: str | Path = CARBON_SIGNAL_PATH,
    capacity: list[int] | None = None,
) -> GreenWindow | None:
    """
    Schedule a job in the greenest available window.
    
    Returns:
        The selected GreenWindow, or None if no capacity available
    """
    windows = find_all_green_windows(
        runtime_hours, requested_cpus, carbon_signal_path, capacity
    )
    
    if not windows:
        return None
    
    # Select the greenest window (first in sorted list)
    best_window = windows[0]
    
    # Allocate resources
    allocate(best_window.start_hour, runtime_hours, requested_cpus, capacity=capacity)
    
    return best_window


def get_top_n_green_windows(
    runtime_hours: int,
    requested_cpus: int,
    n: int = 5,
    carbon_signal_path: str | Path = CARBON_SIGNAL_PATH,
    capacity: list[int] | None = None,
) -> list[GreenWindow]:
    """
    Get the N greenest scheduling options without allocating.
    
    Useful for presenting options to users or decision systems.
    """
    windows = find_all_green_windows(
        runtime_hours, requested_cpus, carbon_signal_path, capacity
    )
    return windows[:n]


def calculate_carbon_savings(
    immediate_window: GreenWindow,
    green_window: GreenWindow,
) -> dict[str, float]:
    """
    Calculate carbon savings from choosing green window over immediate.
    
    Args:
        immediate_window: Window starting at hour 0
        green_window: Optimally selected green window
    
    Returns:
        Dictionary with absolute and percentage savings
    """
    absolute_savings = immediate_window.avg_carbon_intensity - green_window.avg_carbon_intensity
    percentage_savings = (absolute_savings / immediate_window.avg_carbon_intensity) * 100
    
    total_savings = immediate_window.total_carbon_cost - green_window.total_carbon_cost
    
    return {
        "avg_carbon_savings_gco2_kwh": absolute_savings,
        "percent_savings": percentage_savings,
        "total_carbon_savings_gco2": total_savings,
    }


def get_enriched_schedule(
    carbon_signal_path: str | Path = CARBON_SIGNAL_PATH,
    capacity: list[int] | None = None,
) -> list[dict[str, int | float | str | None]]:
    """
    Combine timeslot info with carbon signal data for visualization.
    
    Returns:
        List of dictionaries with hour_index, timestamp, available_cpus, and carbon_intensity
    """
    from datetime import datetime
    
    # Get timeslot representations from Layer 2
    timeslots = get_timeslot_info(capacity=capacity, start_time=datetime.now())
    
    # Get carbon signals from Layer 1
    carbon_points = load_carbon_signal_csv(carbon_signal_path)
    
    # Merge them
    enriched = []
    for slot, carbon_point in zip(timeslots, carbon_points):
        enriched.append({
            "hour_index": slot.hour_index,
            "timestamp": slot.timestamp.isoformat() if slot.timestamp else carbon_point.timestamp.isoformat(),
            "available_cpus": slot.available_cpus,
            "carbon_intensity": carbon_point.carbon_signal_gco2_per_kwh,
        })
    
    return enriched


# Example usage and testing
if __name__ == "__main__":
    print("=" * 60)
    print("GREEN WINDOW SCHEDULER - DEMO")
    print("=" * 60)
    
    # Example: Schedule a 6-hour job requiring 200 CPUs
    print("\n1. Finding the greenest window for a 6-hour, 200 CPU job...")
    best_window = schedule_greenest_window(
        runtime_hours=6,
        requested_cpus=200,
    )
    
    if best_window:
        print(f"   ✓ Scheduled at hour {best_window.start_hour}")
        print(f"     Duration: {best_window.runtime_hours} hours")
        print(f"     Avg carbon: {best_window.avg_carbon_intensity:.2f} gCO2/kWh")
        print(f"     Total carbon: {best_window.total_carbon_cost:.2f} gCO2")
    else:
        print("   ✗ No available capacity")
    
    # Show top 5 greenest options
    print("\n2. Top 5 greenest windows:")
    from timespots import reset_capacity
    reset_capacity()  # Reset for fresh analysis
    
    top_windows = get_top_n_green_windows(
        runtime_hours=6,
        requested_cpus=200,
        n=5,
    )
    
    for i, window in enumerate(top_windows, 1):
        print(f"   {i}. Hour {window.start_hour:2d}: {window.avg_carbon_intensity:6.2f} gCO2/kWh "
              f"(total: {window.total_carbon_cost:.2f} gCO2)")
    
    # Compare immediate vs carbon-aware scheduling
    print("\n3. Comparing scheduling strategies...")
    reset_capacity()
    
    # Create a copy for immediate scheduling
    from timespots import make_capacity_array
    immediate_capacity = make_capacity_array()
    green_capacity = make_capacity_array()
    
    # Check if immediate scheduling (hour 0) is feasible
    if check_fit(0, 6, 200, capacity=immediate_capacity):
        # Get carbon cost for immediate scheduling
        carbon_points = load_carbon_signal_csv()
        carbon_values = signal_values(carbon_points)
        immediate_avg = sum(carbon_values[0:6]) / 6
        immediate_total = sum(carbon_values[0:6])
        
        immediate_window = GreenWindow(
            start_hour=0,
            runtime_hours=6,
            avg_carbon_intensity=immediate_avg,
            total_carbon_cost=immediate_total,
        )
        
        # Get green scheduling
        green_window = schedule_greenest_window(6, 200, capacity=green_capacity)
        
        if green_window:
            savings = calculate_carbon_savings(immediate_window, green_window)
            
            print(f"   Immediate (hour 0): {immediate_window.avg_carbon_intensity:.2f} gCO2/kWh")
            print(f"   Green (hour {green_window.start_hour}): {green_window.avg_carbon_intensity:.2f} gCO2/kWh")
            print(f"   Savings: {savings['avg_carbon_savings_gco2_kwh']:.2f} gCO2/kWh "
                  f"({savings['percent_savings']:.1f}%)")
            print(f"   Total carbon avoided: {savings['total_carbon_savings_gco2']:.2f} gCO2")
    
    print("\n" + "=" * 60)


__all__ = [
    "GreenWindow",
    "find_all_green_windows",
    "schedule_greenest_window",
    "get_top_n_green_windows",
    "calculate_carbon_savings",
    "get_enriched_schedule",
]