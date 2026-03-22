import csv
import random

NUM_JOBS = 100


class Job:
    def __init__(self, job_id, submit_hour, requested_cpus, runtime_hours, flexibility_class):
        self._job_id = job_id
        self._submit_hour = submit_hour
        self._requested_cpus = requested_cpus
        self._runtime_hours = runtime_hours
        self._flexibility_class = flexibility_class

    # Getter methods
    def get_job_id(self):
        return self._job_id

    def get_submit_hour(self):
        return self._submit_hour

    def get_requested_cpus(self):
        return self._requested_cpus

    def get_runtime_hours(self):
        return self._runtime_hours

    def get_flexibility_class(self):
        return self._flexibility_class

    # Setter methods
    def set_submit_hour(self, submit_hour):
        if 0 <= submit_hour <= 23:
            self._submit_hour = submit_hour

    def set_requested_cpus(self, cpus):
        if cpus > 0:
            self._requested_cpus = cpus

    def set_runtime_hours(self, runtime):
        if runtime > 0:
            self._runtime_hours = runtime

    def set_flexibility_class(self, flexibility):
        if flexibility in ["rigid", "semi-flexible", "flexible"]:
            self._flexibility_class = flexibility

    # utility methods
    def is_flexible(self):
        return self._flexibility_class != "rigid"

    def max_delay(self):
        if self._flexibility_class == "rigid":
            return 0
        elif self._flexibility_class == "semi-flexible":
            return 6
        else:
            return 24

    def to_dict(self):
        return {
            "job_id": self._job_id,
            "submit_hour": self._submit_hour,
            "requested_cpus": self._requested_cpus,
            "runtime_hours": self._runtime_hours,
            "flexibility_class": self._flexibility_class
        }


def generate_job(job_id):
    submit_hour = random.randint(0, 23)

    job_type = random.choices(
        ["small", "medium", "large"],
        weights=[0.5, 0.3, 0.2]
    )[0]

    if job_type == "small":
        requested_cpus = random.randint(1, 4)
        runtime_hours = round(random.uniform(0.5, 2), 2)

    elif job_type == "medium":
        requested_cpus = random.randint(4, 16)
        runtime_hours = round(random.uniform(2, 8), 2)

    else:
        requested_cpus = random.randint(16, 64)
        runtime_hours = round(random.uniform(8, 24), 2)

    flexibility_class = random.choices(
        ["rigid", "semi-flexible", "flexible"],
        weights=[0.3, 0.3, 0.4]
    )[0]

    return Job(
        job_id,
        submit_hour,
        requested_cpus,
        runtime_hours,
        flexibility_class
    )


def generate_workload(filename="data/jobs_input.csv"):
    jobs = []

    for i in range(1, NUM_JOBS + 1):
        job = generate_job(i)
        jobs.append(job)

    with open(filename, mode="w", newline="") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "job_id",
                "submit_hour",
                "requested_cpus",
                "runtime_hours",
                "flexibility_class"
            ]
        )
        writer.writeheader()
        writer.writerows([job.to_dict() for job in jobs])

    print(f"Generated {NUM_JOBS} jobs → {filename}")


if __name__ == "__main__":
    generate_workload()