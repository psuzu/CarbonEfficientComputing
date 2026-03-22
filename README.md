# CarbonEfficientComputing

To run 

```bash
cd frontend/
npm run dev
# Open http://localhost:3000
```

Carbon-aware HPC scheduling prototype for UVA research computing.

## Current Structure

```text
inputs/
  generate_workload.py   Job model + workload generation
  cluster_state.py       Cluster snapshot model
  carbonsignal.py        Carbon-signal loading and interpolation
modeling/
  timeslots.py           Hourly capacity modeling
  emissions.py           Energy and CO2 estimation
outputs/
  plots/                 Generated analysis plots
tests/
  test_generate_workload.py
  test_cluster_state.py
  test_carbonsignal.py
  test_timeslots.py
  test_emissions.py
data/
  hourly_marginal_emissions.csv
  carbon_signal_48h.csv
```

## Test It Now

```powershell
pytest -q
```

Run a focused test module if you only want one area:

```powershell
pytest tests/test_carbonsignal.py -q
pytest tests/test_generate_workload.py -q
pytest tests/test_timeslots.py -q
pytest tests/test_emissions.py -q
```

Generate the demo workload directly from the package module:

```powershell
python -m inputs.generate_workload
```

If `pytest` is launched from the repository root, `tests/conftest.py` adds the repo root to `sys.path` so package imports resolve consistently.

## What's Ready

- Layer 1 inputs
- Layer 2 modeling
- package-based imports
- automated tests for all current modules

## Next Step

Build Layer 3 in `decision/` using:
- `inputs.generate_workload.Job`
- `inputs.cluster_state.ClusterState`
- `inputs.carbonsignal.CarbonSignalPoint`
- `modeling.timeslots`
- `modeling.emissions`
