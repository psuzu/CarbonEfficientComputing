# CarbonEfficientComputing

Carbon-aware HPC scheduling prototype for UVA research computing.

## Structure

```text
inputs/
  generate_workload.py   Job model + workload generation
  cluster_state.py       Cluster snapshot model
  carbonsignal.py        Carbon-signal loading and interpolation
modeling/
  timeslots.py           Hourly capacity modeling
  emissions.py           Energy and CO2 estimation
analysis/
  OneMonthMarginalCO2.Rmd
frontend/
  src/                   Next.js prototype UI
tests/
  test_generate_workload.py
  test_cluster_state.py
  test_carbonsignal.py
  test_timeslots.py
  test_emissions.py
data/
  hourly_marginal_emissions.csv
  carbon_signal_48h.csv
  hourly_stats.csv
  hourly_sorted_by_carbon_intensity.csv
```

## Python

Run the backend tests from the repository root:

```powershell
pytest -q
```

Run focused modules if you only want one area:

```powershell
pytest tests/test_carbonsignal.py -q
pytest tests/test_generate_workload.py -q
pytest tests/test_timeslots.py -q
pytest tests/test_emissions.py -q
```

Generate the demo workload:

```powershell
python -m inputs.generate_workload
```

Generate the 48-hour carbon signal:

```powershell
python -m inputs.carbonsignal
```

`tests/conftest.py` adds the repo root to `sys.path` so package imports resolve consistently when `pytest` is run from the repository root.

## Frontend

Install dependencies and run the Next.js app from `frontend/`:

```powershell
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Status

- Layer 1 input models are implemented and covered by tests.
- Layer 2 modeling helpers are implemented and covered by tests.
- The frontend is a mock-data prototype, not yet wired to the Python modules.

## Next Step

Build Layer 3 in `decision/` using:
- `inputs.generate_workload.Job`
- `inputs.cluster_state.ClusterState`
- `inputs.carbonsignal.CarbonSignalPoint`
- `modeling.timeslots`
- `modeling.emissions`
