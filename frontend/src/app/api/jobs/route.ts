export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { formatSupabaseError, supabaseServer } from "@/lib/supabase-server";

type JobRow = {
  id: number;
  job_id: number | null;
  submit_hour: number | null;
  requested_cpus: number | null;
  runtime_hours: number | null;
  flexibility_class: string | null;
  workload_class: string | null;
  source_archive: string | null;
  file_bytes: number | null;
  submitter_name: string | null;
  complexity_class: string | null;
  status: string | null;
  scheduled_start: number | null;
  scheduled_end: number | null;
  scheduled_at: string | null;
  carbon_baseline: number | null;
  carbon_optimized: number | null;
  simulation_duration_seconds: number | null;
  simulation_start_time: string | null;
  simulation_end_time: string | null;
  completed_at: string | null;
  created_at: string | null;
};

type SupabaseLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type EstimatedMetrics = {
  baselineEmissions: number;
  optimizedEmissions: number;
  scheduledStart: number;
  delayHours: number;
};

const CURVE: number[] = [
  420, 410, 395, 380, 370, 365, 370, 385, 400, 420, 430, 425,
  410, 390, 360, 330, 300, 280, 265, 260, 270, 290, 320, 360,
  400, 410, 395, 375, 360, 355, 360, 380, 400, 415, 425, 420,
  405, 385, 355, 325, 295, 275, 260, 255, 265, 285, 315, 355,
];

const FLEXIBILITY_DELAY: Record<string, number> = {
  rigid: 0,
  "semi-flexible": 6,
  flexible: 24,
};

const WORKLOAD_POWER_FACTOR: Record<string, number> = {
  interactive: 0.85,
  "dev-test": 1,
  batch: 1.15,
  training: 1.35,
  generic: 1,
};

function toTitleStatus(value: string | null | undefined) {
  const normalized = (value ?? "QUEUED").trim().toUpperCase();
  if (normalized === "COMPLETED") return "Completed";
  if (normalized === "RUNNING") return "Running";
  if (normalized === "SCHEDULED") return "Scheduled";
  return "Queued";
}

function toDbStatus(value: string | null | undefined) {
  return (value ?? "QUEUED").trim().toUpperCase().replace(/ /g, "_");
}

function toFrontendJob(row: JobRow, metrics?: EstimatedMetrics | null) {
  const submitHour = Number(row.submit_hour ?? 0);
  const scheduledStart = Number(row.scheduled_start ?? metrics?.scheduledStart ?? submitHour);
  const status = toTitleStatus(row.status);
  const archiveName = row.source_archive ?? "No archive";
  const progressPercent =
    status === "Completed" ? 100 : status === "Running" ? 50 : status === "Scheduled" ? 10 : 0;

  return {
    id: Number(row.job_id ?? row.id),
    jobName: `Job ${Number(row.job_id ?? row.id)}`,
    archiveName,
    submitHour,
    submittedAt: row.created_at ?? new Date(0).toISOString(),
    submittedCpus: Number(row.requested_cpus ?? 0),
    submittedRuntimeHours: Number(row.runtime_hours ?? 0),
    requestedCpus: Number(row.requested_cpus ?? 0),
    runtimeHours: Number(row.runtime_hours ?? 0),
    flexibilityClass: row.flexibility_class ?? "semi-flexible",
    workloadClass: row.workload_class ?? "generic",
    intensityLabel: "Forecast-aware",
    complexityClass: (row.complexity_class ?? "HIGH").toUpperCase(),
    status,
    progressPercent,
    carbonBaseline: Number(row.carbon_baseline ?? metrics?.baselineEmissions ?? 0),
    carbonOptimized: Number(row.carbon_optimized ?? metrics?.optimizedEmissions ?? 0),
    carbonSaved: Math.max(
      0,
      Number(row.carbon_baseline ?? metrics?.baselineEmissions ?? 0) -
        Number(row.carbon_optimized ?? metrics?.optimizedEmissions ?? 0),
    ),
    scheduledStart,
    latestStartHour: Number(row.scheduled_start ?? metrics?.scheduledStart ?? submitHour),
    delayHours: Number(
      row.scheduled_start != null ? Math.max(scheduledStart - submitHour, 0) : metrics?.delayHours ?? 0
    ),
    queueAheadCount: 0,
    submitterName: row.submitter_name ?? "Anonymous Researcher",
    createdAt: row.created_at,
    simulationStartTime: row.simulation_start_time,
    simulationEndTime: row.simulation_end_time,
    simulationDurationSeconds: row.simulation_duration_seconds,
  };
}

async function estimateJobMetrics(row: JobRow): Promise<EstimatedMetrics | null> {
  const requestedCpus = Number(row.requested_cpus ?? 0);
  const runtimeHours = Number(row.runtime_hours ?? 0);
  const submitHour = Number(row.submit_hour ?? 0);
  const flexibilityClass = String(row.flexibility_class ?? "semi-flexible");
  const workloadClass = String(row.workload_class ?? "generic");
  const fileBytes = Number(row.file_bytes ?? 0);

  if (requestedCpus < 1 || runtimeHours < 1 || submitHour < 0) {
    return null;
  }

  const normalizedFlex = flexibilityClass.trim().toLowerCase();
  const delay = FLEXIBILITY_DELAY[normalizedFlex] ?? 6;
  const hourIndex = Math.min(Math.max(Math.floor(submitHour), 0), 47);
  const latest = Math.min(hourIndex + delay, 47);
  const baselineEnd = Math.min(hourIndex + runtimeHours, 48);
  const baselineSlice = CURVE.slice(hourIndex, baselineEnd);

  if (baselineSlice.length === 0) {
    return null;
  }

  const baselineIntensity =
    baselineSlice.reduce((sum, value) => sum + value, 0) / baselineSlice.length;

  let bestStart = hourIndex;
  let bestScore = baselineIntensity;

  for (let start = hourIndex; start <= latest; start += 1) {
    const end = start + runtimeHours;
    if (end > 48) break;

    const slice = CURVE.slice(start, end);
    if (slice.length !== runtimeHours) continue;

    const avg = slice.reduce((sum, value) => sum + value, 0) / runtimeHours;
    if (avg < bestScore) {
      bestScore = avg;
      bestStart = start;
    }
  }

  const normalizedWorkload = workloadClass.trim().toLowerCase();
  const workloadFactor =
    WORKLOAD_POWER_FACTOR[normalizedWorkload] ?? WORKLOAD_POWER_FACTOR.generic;
  const powerWatts = (60 + requestedCpus * 12 * workloadFactor) * 1.2;
  const fileOverheadKwh = Math.max(fileBytes, 0) / 1_000_000 * 0.001;
  const energyKwh = (powerWatts * runtimeHours) / 1000 + fileOverheadKwh;

  return {
    baselineEmissions: Math.round(energyKwh * baselineIntensity * 10) / 10,
    optimizedEmissions: Math.round(energyKwh * bestScore * 10) / 10,
    scheduledStart: bestStart,
    delayHours: bestStart - hourIndex,
  };
}

function extractMissingColumn(error: SupabaseLikeError) {
  if (error.code !== "PGRST204" || !error.message) {
    return null;
  }

  const match = error.message.match(/'([^']+)' column/);
  return match?.[1] ?? null;
}

async function insertJobWithFallback(payload: Record<string, unknown>) {
  let insertPayload = { ...payload };

  for (;;) {
    const { error } = await supabaseServer.from("jobs").insert([insertPayload]);

    if (!error) {
      return insertPayload;
    }

    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in insertPayload)) {
      throw error;
    }

    const { [missingColumn]: removedColumn, ...rest } = insertPayload;
    void removedColumn;
    insertPayload = rest;
  }
}

export async function GET() {
  try {
    const { data: jobs, error } = await supabaseServer
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const hydratedJobs = await Promise.all(
      (jobs ?? []).map(async (job) => {
        const row = job as JobRow;
        const metrics = await estimateJobMetrics(row);
        return toFrontendJob(row, metrics);
      }),
    );

    return NextResponse.json(hydratedJobs);
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Supabase GET Error:", message);
    return NextResponse.json({ error: `Failed to fetch jobs: ${message}` }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const draftRow: JobRow = {
      id: 0,
      job_id: Number(body.job_id ?? Math.floor(Math.random() * 10000)),
      submit_hour: Number(body.submit_hour ?? body.submitHour ?? new Date().getHours()),
      requested_cpus: Number(body.requested_cpus ?? body.requestedCpus ?? 0),
      runtime_hours: Number(body.runtime_hours ?? body.runtimeHours ?? 0),
      flexibility_class: String(body.flexibility_class ?? body.flexibilityClass ?? "semi-flexible"),
      workload_class: String(body.workload_class ?? body.workloadClass ?? "generic"),
      source_archive: body.source_archive ?? body.sourceArchive ?? null,
      file_bytes: Number(body.file_bytes ?? body.fileBytes ?? 0),
      submitter_name: String(body.submitter_name ?? body.submitterName ?? "Anonymous Researcher"),
      complexity_class: String(body.complexity_class ?? body.complexityClass ?? "HIGH"),
      status: toDbStatus(body.status),
      scheduled_start: body.scheduled_start ?? body.scheduledStart ?? null,
      scheduled_end: body.scheduled_end ?? body.scheduledEnd ?? null,
      scheduled_at: body.scheduled_at ?? body.scheduledAt ?? null,
      carbon_baseline: body.carbon_baseline ?? body.carbonBaseline ?? null,
      carbon_optimized: body.carbon_optimized ?? body.carbonOptimized ?? null,
      simulation_duration_seconds:
        body.simulation_duration_seconds ?? body.simulationDurationSeconds ?? null,
      simulation_start_time:
        body.simulation_start_time ?? body.simulationStartTime ?? null,
      simulation_end_time:
        body.simulation_end_time ?? body.simulationEndTime ?? null,
      completed_at: body.completed_at ?? body.completedAt ?? null,
      created_at: null,
    };

    const metrics = await estimateJobMetrics(draftRow);

    const payload = {
      job_id: draftRow.job_id,
      submit_hour: draftRow.submit_hour,
      requested_cpus: draftRow.requested_cpus,
      runtime_hours: draftRow.runtime_hours,
      flexibility_class: draftRow.flexibility_class,
      workload_class: draftRow.workload_class,
      source_archive: draftRow.source_archive,
      file_bytes: draftRow.file_bytes,
      submitter_name: draftRow.submitter_name,
      complexity_class: draftRow.complexity_class,
      status: draftRow.status,
      scheduled_start: body.scheduled_start ?? body.scheduledStart ?? metrics?.scheduledStart ?? null,
      scheduled_end: body.scheduled_end ?? body.scheduledEnd ?? null,
      scheduled_at: body.scheduled_at ?? body.scheduledAt ?? null,
      carbon_baseline:
        body.carbon_baseline ?? body.carbonBaseline ?? metrics?.baselineEmissions ?? null,
      carbon_optimized:
        body.carbon_optimized ?? body.carbonOptimized ?? metrics?.optimizedEmissions ?? null,
      simulation_duration_seconds:
        body.simulation_duration_seconds ?? body.simulationDurationSeconds ?? null,
      simulation_start_time:
        body.simulation_start_time ?? body.simulationStartTime ?? null,
      simulation_end_time:
        body.simulation_end_time ?? body.simulationEndTime ?? null,
      completed_at: body.completed_at ?? body.completedAt ?? null,
    };

    const savedPayload = await insertJobWithFallback(payload);
    const hydratedMetrics = await estimateJobMetrics(savedPayload as JobRow);

    return NextResponse.json(
      { success: true, job: toFrontendJob(savedPayload as JobRow, hydratedMetrics) },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Supabase POST Error:", message);
    return NextResponse.json({ error: `Failed to create job: ${message}` }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { ids } = (await request.json()) as { ids: number[] };
    const jobIds = (ids ?? []).map(Number).filter((value) => Number.isFinite(value));

    if (jobIds.length === 0) {
      return NextResponse.json({ deleted: [] });
    }

    const { error } = await supabaseServer.from("jobs").delete().in("job_id", jobIds);

    if (error) throw error;

    return NextResponse.json({ deleted: jobIds });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Supabase DELETE Error:", message);
    return NextResponse.json({ error: `Failed to delete jobs: ${message}` }, { status: 500 });
  }
}
