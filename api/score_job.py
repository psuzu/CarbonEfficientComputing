"""Minimal HTTP endpoint: POST /score  →  ScoredJob JSON."""

from __future__ import annotations

import json
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = __import__("pathlib").Path(__file__).resolve().parents[1]
sys.path.insert(0, ROOT.as_posix())

from greenwindowsearch import find_all_green_windows, calculate_carbon_savings, GreenWindow
from inputs.carbonsignal import load_carbon_signal_csv, signal_values
from generate_workload import Job

CARBON_SIGNAL_PATH = ROOT / "data" / "carbon_signal_48h.csv"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def _send(self, status: int, body: dict) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path != "/score":
            self._send(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))

            cpus = int(body["cpus"])
            runtime = int(body["runtime"])
            flex = str(body.get("flexibility", "semi-flexible"))
            submit_hour = int(body.get("submit_hour", 0))
            file_bytes = int(body.get("file_bytes", 0))

            from generate_workload import FLEXIBILITY_DELAY
            delay = FLEXIBILITY_DELAY.get(flex, 6)

            # Get all green windows from real carbon signal
            all_windows = find_all_green_windows(
                runtime_hours=runtime,
                requested_cpus=cpus,
                carbon_signal_path=CARBON_SIGNAL_PATH,
            )

            if not all_windows:
                self._send(400, {"error": "no feasible windows found"})
                return

            # Baseline: window at submit_hour (or nearest feasible)
            carbon_points = load_carbon_signal_csv(CARBON_SIGNAL_PATH)
            values = signal_values(carbon_points)
            horizon = len(values)

            baseline_end = min(submit_hour + runtime, horizon)
            baseline_avg = sum(values[submit_hour:baseline_end]) / (baseline_end - submit_hour)
            baseline_window = GreenWindow(
                start_hour=submit_hour,
                runtime_hours=runtime,
                avg_carbon_intensity=baseline_avg,
                total_carbon_cost=baseline_avg * runtime,
            )

            # Best window within flexibility range from submit_hour
            latest = submit_hour + delay
            eligible = [w for w in all_windows if submit_hour <= w.start_hour <= latest]
            best_window = eligible[0] if eligible else all_windows[0]

            savings = calculate_carbon_savings(baseline_window, best_window)

            file_overhead_kwh = (file_bytes / 1_000_000) * 0.001
            energy_kwh = cpus * 0.15 * runtime + file_overhead_kwh

            self._send(200, {
                "scheduled_start": best_window.start_hour,
                "earliest_start": submit_hour,
                "latest_start": latest,
                "baseline_intensity": round(baseline_avg, 2),
                "optimized_intensity": round(best_window.avg_carbon_intensity, 2),
                "baseline_co2_g": round(energy_kwh * baseline_avg, 1),
                "optimized_co2_g": round(energy_kwh * best_window.avg_carbon_intensity, 1),
                "delay_hours": best_window.start_hour - submit_hour,
                "percent_savings": round(savings["percent_savings"], 1),
            })
        except (KeyError, ValueError, TypeError) as exc:
            self._send(400, {"error": str(exc)})


if __name__ == "__main__":
    port = 8000
    print(f"Job model API running on http://localhost:{port}")
    HTTPServer(("", port), Handler).serve_forever()
