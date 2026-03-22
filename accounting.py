"""Layer 5 – Accounting & Analysis: decision log, per-job and schedule-level accounting."""

from __future__ import annotations

import csv
import json
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Sequence





# Inline emission estimation (modeling.emissions not available on this branch)
def _estimate_emissions(job: Job, carbon_signal: Sequence[object], start_hour: int) -> tuple[float, float]:
    """Returns (energy_kwh, emissions_kgco2e)."""
    values = [
        float(p.carbon_signal_gco2_per_kwh) if hasattr(p, "carbon_signal_gco2_per_kwh") else float(p)
        for p in carbon_signal
    ]
    end = min(start_hour + job.runtime_hours, len(values))
    avg_intensity = sum(values[start_hour:end]) / (end - start_hour)
    power_watts = (60.0 + job.requested_cpus * 12.0) * 1.2
    energy_kwh = power_watts * job.runtime_hours / 1000.0
    emissions_kgco2e = energy_kwh * avg_intensity / 1000.0
    return round(energy_kwh, 4), round(emissions_kgco2e, 6)


DEFAULT_LOG_PATH = Path(__file__).resolve().parent / "data" / "decision_log.json"
DEFAULT_ACCOUNTING_PATH = Path(__file__).resolve().parent / "data" / "job_accounting.csv"


# ---------------------------------------------------------------------------
# Decision Log (Layer 5a)
# ---------------------------------------------------------------------------

@dataclass
class DecisionRecord:
    """One scheduler decision: what was chosen and why."""
    job_id: int
    submit_hour: int
    flexibility_class: str
    baseline_start: int
    scheduled_start: int
    delay_hours: int
    baseline_intensity_gco2_kwh: float
    optimized_intensity_gco2_kwh: float
    percent_savings: float
    timestamp: str = ""

    def __post_init__(self) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat(sep=" ", timespec="seconds")


def log_decision(record: DecisionRecord, path: Path = DEFAULT_LOG_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    records = load_decision_log(path)
    records.append(record)
    with path.open("w", encoding="utf-8") as f:
        json.dump([asdict(r) for r in records], f, indent=2)


def load_decision_log(path: Path = DEFAULT_LOG_PATH) -> list[DecisionRecord]:
    if not path.exists():
        return []
    with path.open(encoding="utf-8") as f:
        return [DecisionRecord(**row) for row in json.load(f)]


# ---------------------------------------------------------------------------
# Per-Job Accounting (Layer 5b)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class JobAccountingRecord:
    """Full carbon accounting for one completed job."""
    job_id: int
    workload_class: str
    requested_cpus: int
    runtime_hours: int
    flexibility_class: str
    scheduled_start: int
    baseline_start: int
    energy_kwh: float
    baseline_emissions_kgco2e: float
    optimized_emissions_kgco2e: float
    savings_kgco2e: float
    percent_savings: float


def compute_job_accounting(
    job: Job,
    carbon_signal: Sequence[object],
    scheduled_start: int,
    baseline_start: int | None = None,
) -> JobAccountingRecord:
    baseline = baseline_start if baseline_start is not None else job.submit_hour
    energy_kwh, baseline_em = _estimate_emissions(job, carbon_signal, baseline)
    _, optimized_em = _estimate_emissions(job, carbon_signal, scheduled_start)
    savings = baseline_em - optimized_em
    pct = (savings / baseline_em * 100) if baseline_em > 0 else 0.0

    return JobAccountingRecord(
        job_id=job.job_id,
        workload_class=getattr(job, "workload_class", "generic"),
        requested_cpus=job.requested_cpus,
        runtime_hours=job.runtime_hours,
        flexibility_class=job.flexibility_class,
        scheduled_start=scheduled_start,
        baseline_start=baseline,
        energy_kwh=energy_kwh,
        baseline_emissions_kgco2e=baseline_em,
        optimized_emissions_kgco2e=optimized_em,
        savings_kgco2e=round(savings, 6),
        percent_savings=round(pct, 2),
    )


def write_job_accounting_csv(
    records: list[JobAccountingRecord],
    path: Path = DEFAULT_ACCOUNTING_PATH,
) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not records:
        return path
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(asdict(records[0]).keys()))
        writer.writeheader()
        for r in records:
            writer.writerow(asdict(r))
    return path


# ---------------------------------------------------------------------------
# Schedule-Level Accounting (Layer 5c)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ScheduleSummary:
    """Aggregate carbon accounting across all jobs in a schedule run."""
    total_jobs: int
    total_energy_kwh: float
    total_baseline_kgco2e: float
    total_optimized_kgco2e: float
    total_savings_kgco2e: float
    avg_percent_savings: float
    jobs_delayed: int
    avg_delay_hours: float


def summarise_schedule(records: list[JobAccountingRecord]) -> ScheduleSummary:
    if not records:
        return ScheduleSummary(0, 0, 0, 0, 0, 0, 0, 0)
    delayed = [r for r in records if r.scheduled_start > r.baseline_start]
    return ScheduleSummary(
        total_jobs=len(records),
        total_energy_kwh=round(sum(r.energy_kwh for r in records), 4),
        total_baseline_kgco2e=round(sum(r.baseline_emissions_kgco2e for r in records), 6),
        total_optimized_kgco2e=round(sum(r.optimized_emissions_kgco2e for r in records), 6),
        total_savings_kgco2e=round(sum(r.savings_kgco2e for r in records), 6),
        avg_percent_savings=round(sum(r.percent_savings for r in records) / len(records), 2),
        jobs_delayed=len(delayed),
        avg_delay_hours=round(
            sum(r.scheduled_start - r.baseline_start for r in delayed) / len(delayed), 2
        ) if delayed else 0.0,
    )


__all__ = [
    "DecisionRecord",
    "JobAccountingRecord",
    "ScheduleSummary",
    "compute_job_accounting",
    "load_decision_log",
    "log_decision",
    "summarise_schedule",
    "write_job_accounting_csv",
]
