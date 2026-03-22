<<<<<<< Updated upstream
import timeslots

def setup():
    timeslots.capacity_array.clear()
    timeslots.capacity_array.extend([1000] * 48)

def test_check_fit_sufficient():
    setup()
    assert timeslots.check_fit(0, 5, 500) == True

def test_check_fit_insufficient():
    setup()
    timeslots.capacity_array[2] = 300
    assert timeslots.check_fit(0, 5, 500) == False

def test_allocate_reduces_capacity():
    setup()
    initial = timeslots.capacity_array[0]
    timeslots.allocate(0, 3, 200)
    assert timeslots.capacity_array[0] == initial - 200

def test_allocate_multiple_hours():
    setup()
    timeslots.allocate(5, 4, 300)
    for i in range(5, 8):
        assert timeslots.capacity_array[i] == 700
    assert timeslots.capacity_array[8] == 1000

def test_sequential_jobs():
    setup()
    timeslots.allocate(0, 5, 300)
    timeslots.allocate(10, 5, 400)
    assert timeslots.capacity_array[0] == 700
    assert timeslots.capacity_array[10] == 600

def test_full_depletion():
    setup()
    timeslots.allocate(0, 5, 1000)
    for i in range(0, 4):
        assert timeslots.capacity_array[i] == 0
    assert timeslots.capacity_array[4] == 1000

def test_check_fit_after_allocate():
    setup()
    timeslots.allocate(0, 3, 900)
    assert timeslots.check_fit(0, 3, 200) == False

if __name__ == "__main__":
    test_check_fit_sufficient()
    test_check_fit_insufficient()
    test_allocate_reduces_capacity()
    test_allocate_multiple_hours()
    test_sequential_jobs()
    test_full_depletion()
    test_check_fit_after_allocate()
    print("Tests all pass.")
=======
"""Tests for root time-slot helpers."""

import pytest

import timeslots


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
>>>>>>> Stashed changes
