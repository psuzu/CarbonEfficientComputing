"""Layer 6 – Output / Demo Layer: generates dashboard-ready JSON for the frontend."""

from __future__ import annotations

import json
import os
from pathlib import Path

from carbon_signals import load_carbon_signal_csv
from generate_workload import load_jobs_csv
from greenwindowsearch import find_all_green_windows, calculate_carbon_savings, GreenWindow
from accounting import compute_job_accounting, summarise_schedule, write_job_accounting_csv

DEFAULT_OUTPUT_PATH = Path(__file__).resolve().parent / "data" / "dashboard.json"
CARBON_SIGNAL_PATH = Path(__file__).resolve().parent / "data" / "carbon_signal_48h.csv"
JOBS_PATH = Path(__file__).resolve().parent / "data" / "jobs_input.csv"


def generate_ai_summary(dashboard: dict) -> str:
    """Use Gemini to generate a natural language summary of the schedule."""
    try:
        from google import genai
        from dotenv import load_dotenv
        load_dotenv()
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return ""
        client = genai.Client(api_key=api_key)
        s = dashboard["summary"]
        prompt = (
            f"You are a carbon efficiency analyst. Summarise this HPC scheduling result "
            f"in 2-3 concise sentences for a dashboard:\n"
            f"- {s['totalJobs']} jobs scheduled\n"
            f"- {s['totalSavingsKgCo2']:.3f} kgCO2 saved ({s['avgPercentSavings']:.1f}% avg reduction)\n"
            f"- {s['jobsDelayed']} jobs delayed by avg {s['avgDelayHours']:.1f} hours\n"
            f"- Total energy: {s['totalEnergyKwh']:.2f} kWh\n"
            f"Be specific, positive, and avoid jargon."
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        return response.text.strip()
    except Exception:
        return ""



def build_dashboard_data(
    jobs_path: Path = JOBS_PATH,
    carbon_signal_path: Path = CARBON_SIGNAL_PATH,
    output_path: Path = DEFAULT_OUTPUT_PATH,
) -> dict:
    jobs = load_jobs_csv(jobs_path)
    carbon_signal = load_carbon_signal_csv(carbon_signal_path)

    # Carbon intensity timeline for charts
    carbon_timeline = [
        {"hour": p.hour_index, "intensity": round(p.carbon_signal_gco2_per_kwh, 2)}
        for p in carbon_signal
    ]

    # Per-job accounting
    accounting_records = []
    job_rows = []

    for job in jobs:
        # skip jobs that exceed the horizon
        if job.submit_hour + job.runtime_hours > len(carbon_signal):
            continue

        windows = find_all_green_windows(
            runtime_hours=job.runtime_hours,
            requested_cpus=job.requested_cpus,
            carbon_signal_path=carbon_signal_path,
        )
        if not windows:
            continue

        # Best window within flexibility
        latest = job.get_latest_start_hour()
        eligible = [w for w in windows if job.submit_hour <= w.start_hour <= latest]
        best = eligible[0] if eligible else windows[0]

        record = compute_job_accounting(
            job, carbon_signal,
            scheduled_start=best.start_hour,
            baseline_start=job.submit_hour,
        )
        accounting_records.append(record)

        job_rows.append({
            "id": job.job_id,
            "submitHour": job.submit_hour,
            "requestedCpus": job.requested_cpus,
            "runtimeHours": job.runtime_hours,
            "flexibilityClass": job.flexibility_class,
            "scheduledStart": best.start_hour,
            "delayHours": best.start_hour - job.submit_hour,
            "baselineEmissionsKg": record.baseline_emissions_kgco2e,
            "optimizedEmissionsKg": record.optimized_emissions_kgco2e,
            "savingsKg": record.savings_kgco2e,
            "percentSavings": record.percent_savings,
            "status": "Completed" if best.start_hour <= job.submit_hour + 2 else "Scheduled",
        })

    summary = summarise_schedule(accounting_records)
    write_job_accounting_csv(accounting_records)

    dashboard = {
        "summary": {
            "totalJobs": summary.total_jobs,
            "totalEnergyKwh": summary.total_energy_kwh,
            "totalBaselineKgCo2": summary.total_baseline_kgco2e,
            "totalOptimizedKgCo2": summary.total_optimized_kgco2e,
            "totalSavingsKgCo2": summary.total_savings_kgco2e,
            "avgPercentSavings": summary.avg_percent_savings,
            "jobsDelayed": summary.jobs_delayed,
            "avgDelayHours": summary.avg_delay_hours,
        },
        "carbonTimeline": carbon_timeline,
        "jobs": job_rows,
    }

    dashboard["aiSummary"] = generate_ai_summary(dashboard)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(dashboard, f, indent=2)

    print(f"Dashboard data written to {output_path}")
    print(f"  {summary.total_jobs} jobs | "
          f"{summary.total_savings_kgco2e:.3f} kgCO2 saved | "
          f"{summary.avg_percent_savings:.1f}% avg reduction")
    return dashboard


if __name__ == "__main__":
    build_dashboard_data()


__all__ = ["build_dashboard_data"]
