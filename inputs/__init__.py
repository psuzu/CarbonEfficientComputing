"""Layer 1 input package."""

from __future__ import annotations

from importlib import import_module


_EXPORTS = {
    "CSV_COLUMNS": "inputs.generate_workload",
    "CarbonSignalPoint": "inputs.carbonsignal",
    "ClusterState": "inputs.cluster_state",
    "DEFAULT_JOBS_PATH": "inputs.generate_workload",
    "FLEXIBILITY_CLASSES": "inputs.generate_workload",
    "FLEXIBILITY_DELAY": "inputs.generate_workload",
    "JOB_PROFILES": "inputs.generate_workload",
    "Job": "inputs.generate_workload",
    "build_carbon_signal": "inputs.carbonsignal",
    "default_cluster": "inputs.cluster_state",
    "generate_carbon_signal": "inputs.carbonsignal",
    "generate_jobs": "inputs.generate_workload",
    "load_carbon_signal_csv": "inputs.carbonsignal",
    "load_jobs_csv": "inputs.generate_workload",
    "load_marginal_emissions": "inputs.carbonsignal",
    "signal_values": "inputs.carbonsignal",
    "write_carbon_signal_csv": "inputs.carbonsignal",
    "write_jobs_csv": "inputs.generate_workload",
}

__all__ = sorted(_EXPORTS)


def __getattr__(name: str) -> object:
    try:
        module_name = _EXPORTS[name]
    except KeyError as exc:
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}") from exc

    module = import_module(module_name)
    value = getattr(module, name)
    globals()[name] = value
    return value


def __dir__() -> list[str]:
    return sorted(list(globals()) + __all__)
