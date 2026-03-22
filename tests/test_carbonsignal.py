"""Tests for the carbon-signal input module."""

import csv
from datetime import datetime

import pytest

from inputs.carbonsignal import (
    CarbonSignalPoint,
    build_carbon_signal,
    convert_lb_per_mwh_to_g_per_kwh,
    generate_carbon_signal,
    interpolate_hourly,
    load_carbon_signal_csv,
    load_marginal_emissions,
    signal_values,
    write_carbon_signal_csv,
)


def test_convert_lb_per_mwh_to_g_per_kwh():
    assert convert_lb_per_mwh_to_g_per_kwh(1.0) == pytest.approx(0.453592)


def test_load_marginal_emissions_sorts_rows(tmp_path):
    csv_path = tmp_path / "marginal.csv"
    csv_path.write_text(
        "datetime,marginal_co2_rate\n"
        "20/02/2026 03:00,160\n"
        "20/02/2026 00:00,100\n",
        encoding="utf-8",
    )

    samples = load_marginal_emissions(csv_path)
    assert samples[0][0] == datetime(2026, 2, 20, 0, 0)
    assert samples[1][0] == datetime(2026, 2, 20, 3, 0)


def test_interpolate_hourly_fills_missing_hours():
    samples = [
        (datetime(2026, 2, 20, 0, 0), 100.0),
        (datetime(2026, 2, 20, 3, 0), 160.0),
        (datetime(2026, 2, 20, 4, 0), 200.0),
    ]
    hourly = interpolate_hourly(samples)
    assert hourly == [
        (datetime(2026, 2, 20, 0, 0), 100.0),
        (datetime(2026, 2, 20, 1, 0), 120.0),
        (datetime(2026, 2, 20, 2, 0), 140.0),
        (datetime(2026, 2, 20, 3, 0), 160.0),
        (datetime(2026, 2, 20, 4, 0), 200.0),
    ]


def test_build_carbon_signal_creates_hour_indexed_points():
    samples = [
        (datetime(2026, 2, 20, 0, 0), 100.0),
        (datetime(2026, 2, 20, 1, 0), 200.0),
        (datetime(2026, 2, 20, 2, 0), 300.0),
    ]
    points = build_carbon_signal(samples, horizon_hours=3)
    assert [point.hour_index for point in points] == [0, 1, 2]
    assert signal_values(points) == pytest.approx([45.3592, 90.7184, 136.0776])


def test_write_and_load_carbon_signal_csv(tmp_path):
    output_path = tmp_path / "signal.csv"
    points = [
        CarbonSignalPoint(
            hour_index=0,
            timestamp=datetime(2026, 2, 20, 0, 0),
            carbon_signal_gco2_per_kwh=45.3592,
        )
    ]

    write_carbon_signal_csv(points, output_path)
    loaded = load_carbon_signal_csv(output_path)
    assert loaded == points

    with output_path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
    assert rows[0]["signal_type"] == "marginal_proxy"


def test_generate_carbon_signal_runs_end_to_end(tmp_path):
    source_path = tmp_path / "source.csv"
    output_path = tmp_path / "output.csv"
    source_path.write_text(
        "datetime,marginal_co2_rate\n"
        "20/02/2026 00:00,100\n"
        "20/02/2026 01:00,200\n"
        "20/02/2026 02:00,300\n",
        encoding="utf-8",
    )

    written_path = generate_carbon_signal(source_path, output_path, horizon_hours=3)
    assert written_path == output_path
    assert output_path.exists()
