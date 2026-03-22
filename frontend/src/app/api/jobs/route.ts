import { NextResponse } from 'next/server';
import { formatSupabaseError, supabaseServer } from '@/lib/supabase-server';
import { estimateSubmission } from '../../../lib/carbon-estimation';

const MAX_CONCURRENT = 3;

export type JobRow = {
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
  complexity: string | null;
  started_at: string | null;
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

function classifyComplexity(cpus: number, flex: string): 'low' | 'high' {
  return flex === 'flexible' && cpus <= 32 ? 'low' : 'high';
}

function toTitleStatus(value: string | null | undefined) {
  const normalized = (value ?? 'QUEUED').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'Completed';
  if (normalized === 'RUNNING') return 'Running';
  if (normalized === 'QUEUED' || normalized === 'SCHEDULED') return 'Queued';
  return 'Queued';
}

function toDbStatus(value: string | null | undefined) {
  return (value ?? "QUEUED").trim().toUpperCase().replace(/ /g, "_");
}

function toFrontendJob(row: JobRow, metrics?: EstimatedMetrics | null, queuePosition?: number) {
  const submitHour = Number(row.submit_hour ?? 0);
  const scheduledStart = Number(row.scheduled_start ?? metrics?.scheduledStart ?? submitHour);
  const status = toTitleStatus(row.status);
  const archiveName = row.source_archive ?? "No archive";
  const progressPercent =
    status === "Completed" ? 100 : status === "Running" ? 50 : 0;

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
    flexibilityClass: row.flexibility_class ?? 'semi-flexible',
    complexity: row.complexity ?? 'high',
    status: toTitleStatus(row.status),
    carbonBaseline: Number(row.carbon_baseline ?? metrics?.baselineEmissions ?? 0),
    carbonOptimized: Number(row.carbon_optimized ?? metrics?.optimizedEmissions ?? 0),
    carbonSaved: Math.max(
      0,
      Number(row.carbon_baseline ?? metrics?.baselineEmissions ?? 0) -
        Number(row.carbon_optimized ?? metrics?.optimizedEmissions ?? 0),
    ),
    scheduledStart,
    delayHours: Number(
      row.scheduled_start != null
        ? Math.max(scheduledStart - submitHour, 0)
        : (metrics?.delayHours ?? 0)
    ),
    submitterName: row.submitter_name ?? 'Anonymous Researcher',
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
    queuePosition: queuePosition ?? null,
  };
}

async function estimateJobMetrics(row: JobRow): Promise<EstimatedMetrics | null> {
  const requestedCpus = Number(row.requested_cpus ?? 0);
  const runtimeHours = Number(row.runtime_hours ?? 0);
  const submitHour = Number(row.submit_hour ?? 0);
  const flexibilityClass = String(row.flexibility_class ?? 'semi-flexible');

  if (requestedCpus < 1 || runtimeHours < 1 || submitHour < 0) return null;

  try {
    const estimate = estimateSubmission({
      cpus: requestedCpus,
      runtime_hours: runtimeHours,
      submit_hour: submitHour,
      flexibility_class: flexibilityClass as 'rigid' | 'semi-flexible' | 'flexible',
    }) as {
      baseline_emissions_gco2e: number;
      optimized_emissions_gco2e: number;
      scheduled_start_hour: number;
      delay_hours: number;
    };
    return {
      baselineEmissions: Number(estimate.baseline_emissions_gco2e ?? 0),
      optimizedEmissions: Number(estimate.optimized_emissions_gco2e ?? 0),
      scheduledStart: Number(estimate.scheduled_start_hour ?? submitHour),
      delayHours: Number(estimate.delay_hours ?? 0),
    };
  } catch {
    return null;
  }
}

function extractMissingColumn(error: SupabaseLikeError) {
  if (error.code !== 'PGRST204' || !error.message) return null;
  const match = error.message.match(/'([^']+)' column/);
  return match?.[1] ?? null;
}

async function insertJobWithFallback(payload: Record<string, unknown>) {
  let insertPayload = { ...payload };
  for (;;) {
    const { error } = await supabaseServer.from('jobs').insert([insertPayload]);
    if (!error) return insertPayload;
    const missingColumn = extractMissingColumn(error);
    if (!missingColumn || !(missingColumn in insertPayload)) throw error;
    const { [missingColumn]: _removed, ...rest } = insertPayload;
    void _removed;
    insertPayload = rest;
  }
}

// GET: Fetch all jobs, annotate queue positions
export async function GET() {
  try {
    const { data: jobs, error } = await supabaseServer
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    // Build queue position map (oldest queued = position 1)
    const queuedJobs = [...(jobs ?? [])]
      .filter((j) => j.status === 'QUEUED' || j.status === 'SCHEDULED')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const queuePositionMap = new Map<number, number>();
    queuedJobs.forEach((j, i) => {
      queuePositionMap.set(Number(j.job_id ?? j.id), i + 1);
    });

    const hydratedJobs = await Promise.all(
      (jobs ?? []).map(async (job) => {
        const row = job as JobRow;
        const metrics = await estimateJobMetrics(row);
        const queuePos = queuePositionMap.get(Number(row.job_id ?? row.id));
        return toFrontendJob(row, metrics, queuePos);
      }),
    );

    return NextResponse.json(hydratedJobs);
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Supabase GET Error:", message);
    return NextResponse.json({ error: `Failed to fetch jobs: ${message}` }, { status: 500 });
  }
}

// POST: Submit a new job
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const cpus = Number(body.requested_cpus ?? body.requestedCpus ?? 0);
    const flex = String(body.flexibility_class ?? body.flexibilityClass ?? 'semi-flexible');
    const complexity = classifyComplexity(cpus, flex);

    // Count currently running jobs
    const { count: runningCount, error: countError } = await supabaseServer
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'RUNNING');

    if (countError) throw countError;

    // Low complexity jobs skip the green window check — FIFO, run immediately if slot open
    // High complexity jobs need a green window; if all taken → QUEUED
    const allWindowsReserved = body.all_windows_reserved === true;
    const atCap = (runningCount ?? 0) >= MAX_CONCURRENT;

    let status: string;
    if (complexity === 'low') {
      status = atCap ? 'QUEUED' : 'RUNNING';
    } else {
      // high complexity
      if (atCap || allWindowsReserved) {
        status = 'QUEUED';
      } else {
        status = 'RUNNING';
      }
    }

    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      job_id: Number(body.job_id ?? Math.floor(Math.random() * 10000)),
      submit_hour: Number(body.submit_hour ?? body.submitHour ?? new Date().getHours()),
      requested_cpus: cpus,
      runtime_hours: Number(body.runtime_hours ?? body.runtimeHours ?? 0),
      flexibility_class: flex,
      submitter_name: String(body.submitter_name ?? body.submitterName ?? 'Anonymous Researcher'),
      complexity,
      status,
      scheduled_start: body.scheduled_start ?? body.scheduledStart ?? null,
      carbon_baseline: body.carbon_baseline ?? body.carbonBaseline ?? null,
      carbon_optimized: body.carbon_optimized ?? body.carbonOptimized ?? null,
      started_at: status === 'RUNNING' ? now : null,
    };

    const savedPayload = await insertJobWithFallback(payload);
    const metrics = await estimateJobMetrics(savedPayload as JobRow);

    return NextResponse.json(
      { success: true, job: toFrontendJob(savedPayload as JobRow, metrics) },
      { status: 201 }
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
    const jobIds = (ids ?? []).map(Number).filter((v) => Number.isFinite(v));
    if (jobIds.length === 0) return NextResponse.json({ deleted: [] });

    const { error } = await supabaseServer.from('jobs').delete().in('job_id', jobIds);
    if (error) throw error;

    return NextResponse.json({ deleted: jobIds });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Supabase DELETE Error:", message);
    return NextResponse.json({ error: `Failed to delete jobs: ${message}` }, { status: 500 });
  }
}
