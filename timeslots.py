import random

# random CPU availability values for the past 48 hours
capacity_array = [random.randint(1000, 1200) for i in range(48)]

def check_fit(start_hour, runtime_hours, requested_cpus):
    for i in range(start_hour, start_hour + runtime_hours - 1):
        if capacity_array[i] < requested_cpus:
            return False
    return True

def allocate(start_hour, runtime_hours, requested_cpus):
    for i in range(start_hour, start_hour + runtime_hours - 1):
        capacity_array[i] -= requested_cpus