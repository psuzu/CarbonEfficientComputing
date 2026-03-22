"""Tests for the input-layer cluster state model."""

import pytest

from inputs.cluster_state import ClusterState, default_cluster


class TestClusterStateConstruction:
    def test_default_values(self):
        cluster = ClusterState()
        assert cluster.total_nodes == 20
        assert cluster.total_processors == 640
        assert cluster.total_gpus == 8
        assert cluster.nodes_in_use == 0
        assert cluster.processors_in_use == 0
        assert cluster.gpus_in_use == 0
        assert cluster.jobs_running == 0
        assert cluster.jobs_queued == 0

    def test_is_immutable(self):
        cluster = ClusterState()
        with pytest.raises(AttributeError):
            cluster.nodes_in_use = 5


class TestClusterStateValidation:
    def test_capacity_must_be_positive(self):
        with pytest.raises(ValueError, match="total_nodes"):
            ClusterState(total_nodes=0)

    def test_usage_cannot_exceed_capacity(self):
        with pytest.raises(ValueError, match="processors_in_use.*cannot exceed"):
            ClusterState(total_processors=100, processors_in_use=101)

    def test_job_counts_must_be_non_negative(self):
        with pytest.raises(ValueError, match="jobs_queued"):
            ClusterState(jobs_queued=-1)


class TestComputedProperties:
    def test_available_counts(self):
        cluster = ClusterState(
            total_nodes=20,
            total_processors=640,
            total_gpus=8,
            nodes_in_use=12,
            processors_in_use=338,
            gpus_in_use=5,
        )
        assert cluster.nodes_available == 8
        assert cluster.processors_available == 302
        assert cluster.gpus_available == 3

    def test_utilization_rounding(self):
        cluster = ClusterState(
            total_nodes=20,
            total_processors=640,
            total_gpus=8,
            nodes_in_use=12,
            processors_in_use=338,
            gpus_in_use=5,
        )
        assert cluster.node_utilization == 60.0
        assert cluster.processor_utilization == 52.81
        assert cluster.gpu_utilization == 62.5

    def test_can_allocate(self):
        cluster = ClusterState(
            total_nodes=10,
            total_processors=320,
            total_gpus=4,
            nodes_in_use=5,
            processors_in_use=160,
            gpus_in_use=1,
        )
        assert cluster.can_allocate(requested_cpus=32, requested_gpus=1, requested_nodes=1) is True
        assert cluster.can_allocate(requested_cpus=400, requested_gpus=1, requested_nodes=1) is False


class TestSerialisation:
    def test_round_trip(self):
        original = ClusterState(
            total_nodes=15,
            total_processors=480,
            total_gpus=6,
            nodes_in_use=7,
            processors_in_use=200,
            gpus_in_use=3,
            jobs_running=25,
            jobs_queued=10,
        )
        rebuilt = ClusterState.from_dict(original.to_dict())
        assert rebuilt == original

    def test_from_dict_missing_field(self):
        with pytest.raises(ValueError, match="Missing required field"):
            ClusterState.from_dict({"total_nodes": "10"})


class TestDisplayAndFactory:
    def test_default_cluster(self):
        cluster = default_cluster()
        assert isinstance(cluster, ClusterState)
        assert cluster.total_nodes == 40
        assert cluster.total_processors == 1280
        assert cluster.total_gpus == 32

    def test_summary_contains_dashboard_fields(self):
        cluster = ClusterState(
            total_nodes=20,
            total_processors=640,
            total_gpus=8,
            nodes_in_use=12,
            processors_in_use=338,
            gpus_in_use=5,
            jobs_running=30,
            jobs_queued=8,
        )
        text = cluster.summary()
        assert "HPC Cluster Status" in text
        assert "Nodes Available" in text
        assert "Processors Available" in text
        assert "Jobs Running" in text
