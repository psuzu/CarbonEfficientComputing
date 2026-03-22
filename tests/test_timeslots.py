"""Tests for modeling-layer time-slot helpers."""

import pytest

from modeling import timeslots


@pytest.fixture(autouse=True)
def reset_global_capacity():
    timeslots.reset_capacity()


def test_check_fit_succeeds_with_sufficient_capacity():
    assert timeslots.check_fit(0, 5, 500) is True


def test_check_fit_includes_last_occupied_hour():
    timeslots.capacity_array[4] = 300
    assert timeslots.check_fit(0, 5, 500) is False


def test_allocate_reduces_capacity_across_entire_window():
    timeslots.allocate(5, 4, 300)
    for hour in range(5, 9):
        assert timeslots.capacity_array[hour] == 700
    assert timeslots.capacity_array[9] == 1000


def test_allocate_rejects_insufficient_capacity():
    timeslots.capacity_array[2] = 100
    with pytest.raises(ValueError, match="Insufficient capacity"):
        timeslots.allocate(0, 3, 200)


def test_custom_capacity_argument_is_isolated_from_global_state():
    custom_capacity = timeslots.make_capacity_array(horizon_hours=6, capacity=600)
    timeslots.allocate(1, 2, 100, capacity=custom_capacity)
    assert custom_capacity == [600, 500, 500, 600, 600, 600]
    assert timeslots.capacity_array[1] == 1000
