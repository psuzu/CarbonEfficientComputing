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

Core architecture:

- The scheduler uses the repo's formula-based estimator as the primary signal:
  `CO2 = runtime × CPUs × power × carbon_intensity`
- This estimator is the reproducible, scalable path used by the frontend and scheduling logic.
- Real workload execution is available for demos.
- CodeCarbon is optional and should be treated as a demo add-on, not the core system.

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

Run one real demo workload tied to the sample `Job` input:

```powershell
python run_demo_job.py
```

Optionally measure the same job with CodeCarbon:

```powershell
python run_demo_job.py --measure
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
- The formula-based estimator is the primary architecture for scheduling and emissions comparison.
- Real demo workload execution helpers are available through `modeling.execution`.
- Optional CodeCarbon measurement is available through `python run_demo_job.py --measure` as a demo add-on only.
- The frontend submit flow now calls `estimator.py` through a Next.js API route to generate real emissions estimates from `data/carbon_signal_48h.csv`.

## Next Step

Build Layer 3 in `decision/` using:
- `inputs.generate_workload.Job`
- `inputs.cluster_state.ClusterState`
- `inputs.carbonsignal.CarbonSignalPoint`
- `modeling.timeslots`
- `modeling.emissions`
