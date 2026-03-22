import { carbonForecast, mockJobs, type FlexibilityClass } from "./mock-data";

const POWER_PER_CPU_KW = 0.15;

type EstimateInput = {
  cpus: number;
  runtime_hours: number;
  submit_hour: number;
  flexibility_class: FlexibilityClass;
  latest_start_hour?: number | null;
};

function allowedDelayHours(flexibilityClass: FlexibilityClass) {
  if (flexibilityClass === "rigid") return 0;
  if (flexibilityClass === "semi-flexible") return 6;
  return 24;
}

function getForecastValues() {
  return carbonForecast.map((point) => point.intensity);
}

function calculateJobEmissions(cpus: number, runtimeHours: number, startHour: number, forecastValues: number[]) {
  const endHour = startHour + runtimeHours;
  if (startHour < 0 || endHour > forecastValues.length) {
    throw new Error("Job window exceeds the available forecast horizon.");
  }

  const energyPerHourKwh = cpus * POWER_PER_CPU_KW;
  let total = 0;
  for (let hour = startHour; hour < endHour; hour += 1) {
    total += energyPerHourKwh * forecastValues[hour];
  }
  return total;
}

export function estimateSubmission(payload: EstimateInput) {
  const requestedCpus = Number(payload.cpus);
  const runtimeHours = Number(payload.runtime_hours);
  const submitHour = Number(payload.submit_hour);

  if (!Number.isInteger(requestedCpus) || requestedCpus < 1) {
    throw new Error("cpus must be a positive integer");
  }
  if (!Number.isInteger(runtimeHours) || runtimeHours < 1) {
    throw new Error("runtime_hours must be a positive integer");
  }
  if (!Number.isInteger(submitHour) || submitHour < 0) {
    throw new Error("submit_hour must be a non-negative integer");
  }

  const forecastValues = getForecastValues();
  const baselineEmissions = calculateJobEmissions(
    requestedCpus,
    runtimeHours,
    submitHour,
    forecastValues,
  );

  let latestStartHour = submitHour + allowedDelayHours(payload.flexibility_class);
  if (payload.latest_start_hour != null) {
    latestStartHour = Math.min(latestStartHour, Number(payload.latest_start_hour));
  }
  latestStartHour = Math.min(latestStartHour, forecastValues.length - runtimeHours);

  if (latestStartHour < submitHour) {
    throw new Error("runtime_hours exceeds the available forecast horizon for this submission");
  }

  let bestStartHour = submitHour;
  let bestEmissions = baselineEmissions;

  for (let candidateStart = submitHour; candidateStart <= latestStartHour; candidateStart += 1) {
    const candidateEmissions = calculateJobEmissions(
      requestedCpus,
      runtimeHours,
      candidateStart,
      forecastValues,
    );

    if (candidateEmissions < bestEmissions) {
      bestStartHour = candidateStart;
      bestEmissions = candidateEmissions;
    }
  }

  return {
    requested_cpus: requestedCpus,
    runtime_hours: runtimeHours,
    submit_hour: submitHour,
    flexibility_class: payload.flexibility_class,
    latest_start_hour: latestStartHour,
    baseline_emissions_gco2e: Number(baselineEmissions.toFixed(2)),
    optimized_emissions_gco2e: Number(bestEmissions.toFixed(2)),
    scheduled_start_hour: bestStartHour,
    delay_hours: bestStartHour - submitHour,
    carbon_saved_gco2e: Number((baselineEmissions - bestEmissions).toFixed(2)),
  };
}

export function buildSchedulePreview() {
  const jobs = mockJobs.map((job) => ({
    job_id: job.id,
    baseline_start: job.submitHour,
    scheduled_start: job.scheduledStart,
    delay_hours: job.delayHours ?? Math.max(job.scheduledStart - job.submitHour, 0),
    baseline_kgco2e: Number((job.carbonBaseline / 1000).toFixed(3)),
    scheduled_kgco2e: Number((job.carbonOptimized / 1000).toFixed(3)),
    savings_kgco2e: Number(((job.carbonBaseline - job.carbonOptimized) / 1000).toFixed(3)),
    savings_pct: job.carbonBaseline > 0
      ? Number((((job.carbonBaseline - job.carbonOptimized) / job.carbonBaseline) * 100).toFixed(1))
      : 0,
  }));

  const totalBaseline = jobs.reduce((sum, job) => sum + job.baseline_kgco2e, 0);
  const totalScheduled = jobs.reduce((sum, job) => sum + job.scheduled_kgco2e, 0);
  const totalSavings = totalBaseline - totalScheduled;

  return {
    summary: {
      total_jobs: jobs.length,
      scheduled_jobs: jobs.length,
      unscheduled_jobs: 0,
      baseline_kgco2e: Number(totalBaseline.toFixed(3)),
      scheduled_kgco2e: Number(totalScheduled.toFixed(3)),
      savings_kgco2e: Number(totalSavings.toFixed(3)),
      savings_pct: totalBaseline > 0 ? Number(((totalSavings / totalBaseline) * 100).toFixed(1)) : 0,
    },
    jobs,
    unscheduled: [],
    carbon_forecast: carbonForecast.map((point) => ({
      hour: point.hour,
      intensity: Number(point.intensity.toFixed(2)),
      datetime: new Date(Date.UTC(2026, 1, 20, point.hour, 0, 0)).toISOString(),
    })),
  };
}

export function buildSingleScheduleEstimate(cpus: number, runtime: number, flexibility: FlexibilityClass) {
  const estimate = estimateSubmission({
    cpus,
    runtime_hours: runtime,
    submit_hour: 0,
    flexibility_class: flexibility,
  });

  const baselineKg = estimate.baseline_emissions_gco2e / 1000;
  const scheduledKg = estimate.optimized_emissions_gco2e / 1000;
  const savingsKg = estimate.carbon_saved_gco2e / 1000;

  return {
    job_id: 9999,
    cpus,
    runtime_hours: runtime,
    flexibility,
    baseline_start: 0,
    scheduled_start: estimate.scheduled_start_hour,
    delay_hours: estimate.delay_hours,
    baseline_kgco2e: Number(baselineKg.toFixed(3)),
    scheduled_kgco2e: Number(scheduledKg.toFixed(3)),
    savings_kgco2e: Number(savingsKg.toFixed(3)),
    savings_pct: estimate.baseline_emissions_gco2e > 0
      ? Number(((estimate.carbon_saved_gco2e / estimate.baseline_emissions_gco2e) * 100).toFixed(1))
      : 0,
    baseline_gco2e: estimate.baseline_emissions_gco2e,
    scheduled_gco2e: estimate.optimized_emissions_gco2e,
    savings_gco2e: estimate.carbon_saved_gco2e,
    carbon_forecast: buildSchedulePreview().carbon_forecast,
  };
}
