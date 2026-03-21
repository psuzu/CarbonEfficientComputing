"""
cluster_state.py

Defines the ClusterState data model — the input layer that tracks HPC cluster
resources and utilization at a given point in time.

ClusterState fields (matching an HPC dashboard):
    - total_nodes        : Total compute nodes in the cluster
    - nodes_in_use       : Nodes currently occupied
    - total_processors   : Total CPU cores across all nodes
    - processors_in_use  : CPU cores currently allocated to jobs
    - total_gpus         : Total GPUs available
    - gpus_in_use        : GPUs currently allocated
    - jobs_running       : Number of jobs actively executing
    - jobs_queued        : Number of jobs waiting in the queue
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict


@dataclass(frozen=True)
class ClusterState:

    # Capacity
    total_nodes: int = 20
    total_processors: int = 640
    total_gpus: int = 8

    # Current usage
    nodes_in_use: int = 0
    processors_in_use: int = 0
    gpus_in_use: int = 0

    # Job counts
    jobs_running: int = 0
    jobs_queued: int = 0

    def __post_init__(self) -> None:
        # Capacity checks
        for field, value in [
            ("total_nodes", self.total_nodes),
            ("total_processors", self.total_processors),
            ("total_gpus", self.total_gpus),
        ]:
            if not isinstance(value, int) or value < 1:
                raise ValueError(f"{field} must be a positive int, got {value}")

        # Usage checks
        for field, value, cap_name, cap_value in [
            ("nodes_in_use", self.nodes_in_use, "total_nodes", self.total_nodes),
            ("processors_in_use", self.processors_in_use, "total_processors", self.total_processors),
            ("gpus_in_use", self.gpus_in_use, "total_gpus", self.total_gpus),
        ]:
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field} must be a non-negative int, got {value}")
            if value > cap_value:
                raise ValueError(
                    f"{field} ({value}) cannot exceed {cap_name} ({cap_value})"
                )

        # Job count checks
        for field, value in [
            ("jobs_running", self.jobs_running),
            ("jobs_queued", self.jobs_queued),
        ]:
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{field} must be a non-negative int, got {value}")

    # Computed properties
    @property
    def nodes_available(self) -> int:
        return self.total_nodes - self.nodes_in_use

    @property
    def processors_available(self) -> int:
        return self.total_processors - self.processors_in_use

    @property
    def gpus_available(self) -> int:
        return self.total_gpus - self.gpus_in_use

    @property
    def node_utilization(self) -> float:
        """Percentage of nodes in use (0.0 – 100.0)."""
        return round(self.nodes_in_use / self.total_nodes * 100, 2)

    @property
    def processor_utilization(self) -> float:
        """Percentage of processors in use (0.0 – 100.0)."""
        return round(self.processors_in_use / self.total_processors * 100, 2)

    @property
    def gpu_utilization(self) -> float:
        """Percentage of GPUs in use (0.0 – 100.0)."""
        return round(self.gpus_in_use / self.total_gpus * 100, 2)

    # Serialisation

    def to_dict(self) -> Dict[str, int]:
        """Convert to a plain dictionary."""
        return {
            "total_nodes": self.total_nodes,
            "nodes_in_use": self.nodes_in_use,
            "total_processors": self.total_processors,
            "processors_in_use": self.processors_in_use,
            "total_gpus": self.total_gpus,
            "gpus_in_use": self.gpus_in_use,
            "jobs_running": self.jobs_running,
            "jobs_queued": self.jobs_queued,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "ClusterState":
        """Construct a ClusterState from a dictionary.

        Strictly enforces types — no missing or malformed values allowed.
        """
        try:
            return cls(
                total_nodes=int(data["total_nodes"]),
                nodes_in_use=int(data["nodes_in_use"]),
                total_processors=int(data["total_processors"]),
                processors_in_use=int(data["processors_in_use"]),
                total_gpus=int(data["total_gpus"]),
                gpus_in_use=int(data["gpus_in_use"]),
                jobs_running=int(data["jobs_running"]),
                jobs_queued=int(data["jobs_queued"]),
            )
        except KeyError as exc:
            raise ValueError(f"Missing required field: {exc}") from exc
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid data in dict {data}: {exc}") from exc

    # Display
    def summary(self) -> str:
        """Human-readable dashboard-style summary."""
        lines = [
            "HPC Cluster Status",
            "=" * 40,
            f"  Nodes Available:      {self.nodes_available:>6}  "
            f"({self.node_utilization:.2f}% in use)",
            f"  Processors Available: {self.processors_available:>6}  "
            f"({self.processor_utilization:.2f}% in use)",
            f"  GPUs Available:       {self.gpus_available:>6}  "
            f"({self.gpu_utilization:.2f}% in use)",
            "-" * 40,
            f"  Jobs Running: {self.jobs_running:>6}    "
            f"Jobs Queued: {self.jobs_queued:>6}",
        ]
        return "\n".join(lines)


# Factory
def default_cluster() -> ClusterState:
    """Return a sensible MVP default cluster (20 nodes, 640 CPUs, 8 GPUs)."""
    return ClusterState(
        total_nodes=40,
        total_processors=1280,
        total_gpus=32,
    )
