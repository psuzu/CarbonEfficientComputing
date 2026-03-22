# CarbonEfficientComputing

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

The root files (`generate_workload.py`, `cluster_state.py`, `timeslots.py`, `emissions.py`) are now thin compatibility wrappers. The canonical implementation lives under `inputs/` and `modeling/`.

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

## What’s Ready

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
