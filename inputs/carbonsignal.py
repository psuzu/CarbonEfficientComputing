"""Carbon-signal preparation helpers for Layer 1."""

from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_PATH = PROJECT_ROOT / "data" / "hourly_marginal_emissions.csv"
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "carbon_signal_48h.csv"
INPUT_DATETIME_FORMAT = "%d/%m/%Y %H:%M"
LB_PER_MWH_TO_G_PER_KWH = 0.453592


@dataclass(frozen=True)
class CarbonSignalPoint:
    """One hourly carbon-intensity point."""

    hour_index: int
    timestamp: datetime
    carbon_signal_gco2_per_kwh: float
    signal_type: str = "marginal_proxy"

    def to_dict(self) -> dict[str, int | float | str]:
        return {
            "hour_index": self.hour_index,
            "datetime": self.timestamp.isoformat(sep=" "),
            "carbon_signal_gco2_per_kwh": self.carbon_signal_gco2_per_kwh,
            "signal_type": self.signal_type,
        }

    @classmethod
    def from_dict(cls, row: dict[str, object]) -> "CarbonSignalPoint":
        try:
            return cls(
                hour_index=int(row["hour_index"]),
                timestamp=datetime.fromisoformat(str(row["datetime"])),
                carbon_signal_gco2_per_kwh=float(row["carbon_signal_gco2_per_kwh"]),
                signal_type=str(row.get("signal_type", "marginal_proxy")),
            )
        except KeyError as exc:
            raise ValueError(f"Missing required field: {exc}") from exc
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid carbon signal row {row}: {exc}") from exc


def convert_lb_per_mwh_to_g_per_kwh(rate: float) -> float:
    return rate * LB_PER_MWH_TO_G_PER_KWH


def load_marginal_emissions(path: str | Path = DEFAULT_SOURCE_PATH) -> list[tuple[datetime, float]]:
    samples: list[tuple[datetime, float]] = []
    with Path(path).open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            try:
                timestamp = datetime.strptime(row["datetime"].strip(), INPUT_DATETIME_FORMAT)
                rate = float(row["marginal_co2_rate"])
            except KeyError as exc:
                raise ValueError(f"Missing required field: {exc}") from exc
            except (TypeError, ValueError) as exc:
                raise ValueError(f"Invalid row {row}: {exc}") from exc
            samples.append((timestamp, rate))

    if not samples:
        raise ValueError("No marginal emissions rows found")

    samples.sort(key=lambda sample: sample[0])
    return samples


def interpolate_hourly(samples: list[tuple[datetime, float]]) -> list[tuple[datetime, float]]:
    if len(samples) < 2:
        raise ValueError("At least two samples are required for interpolation")

    hourly_samples: list[tuple[datetime, float]] = []
    for index, (start_time, start_rate) in enumerate(samples[:-1]):
        end_time, end_rate = samples[index + 1]
        total_seconds = (end_time - start_time).total_seconds()
        if total_seconds <= 0 or total_seconds % 3600 != 0:
            raise ValueError("Carbon signal timestamps must be strictly increasing hourly multiples")

        gap_hours = int(total_seconds // 3600)
        for step in range(gap_hours):
            current_time = start_time + timedelta(hours=step)
            interpolated_rate = start_rate + (end_rate - start_rate) * (step / gap_hours)
            hourly_samples.append((current_time, interpolated_rate))

    hourly_samples.append(samples[-1])
    return hourly_samples


def build_carbon_signal(
    samples: list[tuple[datetime, float]],
    horizon_hours: int = 48,
    signal_type: str = "marginal_proxy",
) -> list[CarbonSignalPoint]:
    if not isinstance(horizon_hours, int) or horizon_hours < 1:
        raise ValueError(f"horizon_hours must be a positive int, got {horizon_hours}")

    hourly_samples = interpolate_hourly(samples)
    if len(hourly_samples) < horizon_hours:
        raise ValueError(
            f"Not enough hourly data to build a {horizon_hours}-hour signal: "
            f"only {len(hourly_samples)} samples available"
        )

    return [
        CarbonSignalPoint(
            hour_index=hour_index,
            timestamp=timestamp,
            carbon_signal_gco2_per_kwh=convert_lb_per_mwh_to_g_per_kwh(rate),
            signal_type=signal_type,
        )
        for hour_index, (timestamp, rate) in enumerate(hourly_samples[:horizon_hours])
    ]


def write_carbon_signal_csv(
    points: list[CarbonSignalPoint],
    path: str | Path = DEFAULT_OUTPUT_PATH,
) -> Path:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "hour_index",
                "datetime",
                "carbon_signal_gco2_per_kwh",
                "signal_type",
            ],
        )
        writer.writeheader()
        for point in points:
            writer.writerow(point.to_dict())
    return output_path


def load_carbon_signal_csv(path: str | Path = DEFAULT_OUTPUT_PATH) -> list[CarbonSignalPoint]:
    with Path(path).open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        return [CarbonSignalPoint.from_dict(row) for row in reader]


def signal_values(points: list[CarbonSignalPoint]) -> list[float]:
    return [point.carbon_signal_gco2_per_kwh for point in points]


def generate_carbon_signal(
    source_path: str | Path = DEFAULT_SOURCE_PATH,
    output_path: str | Path = DEFAULT_OUTPUT_PATH,
    horizon_hours: int = 48,
) -> Path:
    samples = load_marginal_emissions(source_path)
    points = build_carbon_signal(samples, horizon_hours=horizon_hours)
    return write_carbon_signal_csv(points, output_path)


def main() -> None:
    output_path = generate_carbon_signal()
    print(f"Wrote carbon signal to {output_path}")


if __name__ == "__main__":
    main()


__all__ = [
    "CarbonSignalPoint",
    "DEFAULT_OUTPUT_PATH",
    "DEFAULT_SOURCE_PATH",
    "build_carbon_signal",
    "convert_lb_per_mwh_to_g_per_kwh",
    "generate_carbon_signal",
    "interpolate_hourly",
    "load_carbon_signal_csv",
    "load_marginal_emissions",
    "signal_values",
    "write_carbon_signal_csv",
]
