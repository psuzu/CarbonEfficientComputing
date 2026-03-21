"""
Tests for cluster_state.py

Covers:
    - ClusterState construction and defaults
    - Validation (rejects invalid data)
    - Computed properties (available counts, utilization %)
    - Serialisation round-trip (to_dict / from_dict)
    - default_cluster() factory
    - summary() display
"""

import pytest

from cluster_state import ClusterState, default_cluster


# ── Construction ────────────────────────────────────────────────────────────

class TestClusterStateConstruction:
    """Valid creation and field access."""

    def test_default_values(self):
        cs = ClusterState()
        assert cs.total_nodes == 20
        assert cs.total_processors == 640
        assert cs.total_gpus == 8
        assert cs.nodes_in_use == 0
        assert cs.processors_in_use == 0
        assert cs.gpus_in_use == 0
        assert cs.jobs_running == 0
        assert cs.jobs_queued == 0

    def test_custom_values(self):
        cs = ClusterState(
            total_nodes=10, total_processors=320, total_gpus=4,
            nodes_in_use=5, processors_in_use=160, gpus_in_use=2,
            jobs_running=12, jobs_queued=3,
        )
        assert cs.total_nodes == 10
        assert cs.nodes_in_use == 5
        assert cs.jobs_running == 12

    def test_is_immutable(self):
        cs = ClusterState()
        with pytest.raises(AttributeError):
            cs.nodes_in_use = 5

    def test_all_resources_in_use(self):
        cs = ClusterState(
            total_nodes=4, total_processors=128, total_gpus=2,
            nodes_in_use=4, processors_in_use=128, gpus_in_use=2,
        )
        assert cs.nodes_available == 0
        assert cs.processors_available == 0
        assert cs.gpus_available == 0


# ── Validation ──────────────────────────────────────────────────────────────

class TestClusterStateValidation:
    """Ensure __post_init__ rejects bad data."""

    def test_zero_total_nodes(self):
        with pytest.raises(ValueError, match="total_nodes"):
            ClusterState(total_nodes=0)

    def test_negative_total_processors(self):
        with pytest.raises(ValueError, match="total_processors"):
            ClusterState(total_processors=-1)

    def test_zero_total_gpus(self):
        with pytest.raises(ValueError, match="total_gpus"):
            ClusterState(total_gpus=0)

    def test_negative_nodes_in_use(self):
        with pytest.raises(ValueError, match="nodes_in_use"):
            ClusterState(nodes_in_use=-1)

    def test_nodes_in_use_exceeds_total(self):
        with pytest.raises(ValueError, match="nodes_in_use.*cannot exceed"):
            ClusterState(total_nodes=10, nodes_in_use=11)

    def test_processors_in_use_exceeds_total(self):
        with pytest.raises(ValueError, match="processors_in_use.*cannot exceed"):
            ClusterState(total_processors=100, processors_in_use=101)

    def test_gpus_in_use_exceeds_total(self):
        with pytest.raises(ValueError, match="gpus_in_use.*cannot exceed"):
            ClusterState(total_gpus=4, gpus_in_use=5)

    def test_negative_jobs_running(self):
        with pytest.raises(ValueError, match="jobs_running"):
            ClusterState(jobs_running=-1)

    def test_negative_jobs_queued(self):
        with pytest.raises(ValueError, match="jobs_queued"):
            ClusterState(jobs_queued=-3)


# ── Computed Properties ─────────────────────────────────────────────────────

class TestComputedProperties:
    """Tests for available counts and utilization percentages."""

    def test_available_counts(self):
        cs = ClusterState(
            total_nodes=20, total_processors=640, total_gpus=8,
            nodes_in_use=12, processors_in_use=338, gpus_in_use=5,
        )
        assert cs.nodes_available == 8
        assert cs.processors_available == 302
        assert cs.gpus_available == 3

    def test_utilization_zero(self):
        cs = ClusterState()
        assert cs.node_utilization == 0.0
        assert cs.processor_utilization == 0.0
        assert cs.gpu_utilization == 0.0

    def test_utilization_full(self):
        cs = ClusterState(
            total_nodes=10, total_processors=320, total_gpus=4,
            nodes_in_use=10, processors_in_use=320, gpus_in_use=4,
        )
        assert cs.node_utilization == 100.0
        assert cs.processor_utilization == 100.0
        assert cs.gpu_utilization == 100.0

    def test_utilization_partial(self):
        cs = ClusterState(
            total_nodes=20, total_processors=640, total_gpus=8,
            nodes_in_use=12, processors_in_use=338, gpus_in_use=5,
        )
        assert cs.node_utilization == 60.0
        assert cs.processor_utilization == 52.81
        assert cs.gpu_utilization == 62.5


# ── Serialisation ───────────────────────────────────────────────────────────

class TestSerialisation:
    """Round-trip through dict representation."""

    def test_to_dict_keys(self):
        cs = ClusterState()
        d = cs.to_dict()
        expected_keys = {
            "total_nodes", "nodes_in_use",
            "total_processors", "processors_in_use",
            "total_gpus", "gpus_in_use",
            "jobs_running", "jobs_queued",
        }
        assert set(d.keys()) == expected_keys

    def test_round_trip(self):
        original = ClusterState(
            total_nodes=15, total_processors=480, total_gpus=6,
            nodes_in_use=7, processors_in_use=200, gpus_in_use=3,
            jobs_running=25, jobs_queued=10,
        )
        rebuilt = ClusterState.from_dict(original.to_dict())
        assert rebuilt == original

    def test_from_dict_with_string_values(self):
        data = {
            "total_nodes": "10", "nodes_in_use": "3",
            "total_processors": "320", "processors_in_use": "96",
            "total_gpus": "4", "gpus_in_use": "1",
            "jobs_running": "5", "jobs_queued": "2",
        }
        cs = ClusterState.from_dict(data)
        assert cs.total_nodes == 10
        assert isinstance(cs.total_nodes, int)

    def test_from_dict_missing_field(self):
        with pytest.raises(ValueError, match="Missing required field"):
            ClusterState.from_dict({"total_nodes": "10"})


# ── Factory ─────────────────────────────────────────────────────────────────

class TestDefaultCluster:
    """Tests for the default_cluster() factory."""

    def test_returns_valid_state(self):
        cs = default_cluster()
        assert cs.total_nodes == 40
        assert cs.total_processors == 1280
        assert cs.total_gpus == 32
        assert cs.nodes_in_use == 0
        assert cs.jobs_running == 0

    def test_is_cluster_state(self):
        assert isinstance(default_cluster(), ClusterState)


# ── Summary display ─────────────────────────────────────────────────────────

class TestSummary:
    """Tests for the summary() display method."""

    def test_summary_contains_key_info(self):
        cs = ClusterState(
            total_nodes=20, total_processors=640, total_gpus=8,
            nodes_in_use=12, processors_in_use=338, gpus_in_use=5,
            jobs_running=30, jobs_queued=8,
        )
        text = cs.summary()
        assert "HPC Cluster Status" in text
        assert "8" in text        # nodes available
        assert "302" in text      # processors available
        assert "3" in text        # gpus available
        assert "60.00%" in text   # node utilization
        assert "30" in text       # jobs running
