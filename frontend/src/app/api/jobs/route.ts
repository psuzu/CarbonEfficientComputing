import { NextResponse } from 'next/server';
import { formatSupabaseError, supabaseServer } from '@/lib/supabase-server';
import { runPythonScript } from '@/lib/python';
import path from 'node:path';

type JobRow = {
  id: number;
  job_id: number | null;
  submit_hour: number | null;
  requested_cpus: number | null;
  runtime_hours: number | null;
  flexibility_class: string | null;
  submitter_name: string | null;
  status: string | null;
  scheduled_start: number | null;
  carbon_baseline: number | null;
  carbon_optimized: number | null;
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

function toTitleStatus(value: string | null | undefined) {
  const normalized = (value ?? 'QUEUED').trim().toUpperCase();
  if (normalized === 'COMPLETED') return 'Completed';
  if (normalized === 'RUNNING') return 'Running';
  if (normalized === 'SCHEDULED') return 'Queued';
  return 'Queued';
}

function toDbStatus(value: string | null | undefined) {
  return (value ?? 'QUEUED').trim().toUpperCase().replace(/ /g, '_');
}

function toFrontendJob(row: JobRow, metrics?: EstimatedMetrics | null) {
  const submitHour = Number(row.submit_hour ?? 0);
  const scheduledStart = Number(row.scheduled_start ?? metrics?.scheduledStart ?? submitHour);

  return {
    id: Number(row.job_id ?? row.id),
    submitHour,
    requestedCpus: Number(row.requested_cpus ?? 0),
    runtimeHours: Number(row.runtime_hours ?? 0),
    flexibilityClass: row.flexibility_class ?? 'semi-flexible',
    status: toTitleStatus(row.status),
    carbonBaseline: Number(row.carbon_baseline ?? metrics?.baselineEmissions ?? 0),
    carbonOptimized: Number(row.carbon_optimized ?? metrics?.optimizedEmissions ?? 0),
    scheduledStart,
    delayHours: Number(row.scheduled_start != null ? Math.max(scheduledStart - submitHour, 0) : metrics?.delayHours ?? 0),
    submitterName: row.submitter_name ?? 'Anonymous Researcher',
    createdAt: row.created_at,
  };
}

async function estimateJobMetrics(row: JobRow): Promise<EstimatedMetrics | null> {
  const requestedCpus = Number(row.requested_cpus ?? 0)
  const runtimeHours = Number(row.runtime_hours ?? 0)
  const submitHour = Number(row.submit_hour ?? 0)
  const flexibilityClass = String(row.flexibility_class ?? 'semi-flexible')

  if (requestedCpus < 1 || runtimeHours < 1 || submitHour < 0) {
    return null
  }

  try {
    const repoRoot = path.resolve(process.cwd(), '..')
    const raw = await runPythonScript(
      repoRoot,
      'estimator.py',
      JSON.stringify({
        cpus: requestedCpus,
        runtime_hours: runtimeHours,
        submit_hour: submitHour,
        flexibility_class: flexibilityClass,
      }),
    )

    const estimate = JSON.parse(raw) as {
      baseline_emissions_gco2e: number
      optimized_emissions_gco2e: number
      scheduled_start_hour: number
      delay_hours: number
    }

    return {
      baselineEmissions: Number(estimate.baseline_emissions_gco2e ?? 0),
      optimizedEmissions: Number(estimate.optimized_emissions_gco2e ?? 0),
      scheduledStart: Number(estimate.scheduled_start_hour ?? submitHour),
      delayHours: Number(estimate.delay_hours ?? 0),
    }
  } catch {
    return null
  }
}

function extractMissingColumn(error: SupabaseLikeError) {
  if (error.code !== 'PGRST204' || !error.message) {
    return null;
  }

  const match = error.message.match(/'([^']+)' column/)
  return match?.[1] ?? null
}

async function insertJobWithFallback(payload: Record<string, unknown>) {
  let insertPayload = { ...payload }

  for (;;) {
    const { error } = await supabaseServer.from('jobs').insert([insertPayload])

    if (!error) {
      return insertPayload
    }

    const missingColumn = extractMissingColumn(error)
    if (!missingColumn || !(missingColumn in insertPayload)) {
      throw error
    }

    const { [missingColumn]: removedColumn, ...rest } = insertPayload
    void removedColumn
    insertPayload = rest
  }
}

// GET: Fetch all jobs for the dashboard
export async function GET() {
  try {
    const { data: jobs, error } = await supabaseServer
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const hydratedJobs = await Promise.all(
      (jobs ?? []).map(async (job) => {
        const row = job as JobRow
        const metrics = await estimateJobMetrics(row)
        return toFrontendJob(row, metrics)
      }),
    )

    return NextResponse.json(hydratedJobs);
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error('Supabase GET Error:', message);
    return NextResponse.json({ error: `Failed to fetch jobs: ${message}` }, { status: 500 });
  }
}

// POST: Submit a new job from the frontend
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const payload = {
      job_id: Number(body.job_id ?? Math.floor(Math.random() * 10000)),
      submit_hour: Number(
        body.submit_hour ??
        body.submitHour ??
        new Date().getHours(),
      ),
      requested_cpus: Number(body.requested_cpus ?? body.requestedCpus ?? 0),
      runtime_hours: Number(body.runtime_hours ?? body.runtimeHours ?? 0),
      flexibility_class: String(body.flexibility_class ?? body.flexibilityClass ?? 'semi-flexible'),
      submitter_name: String(body.submitter_name ?? body.submitterName ?? 'Anonymous Researcher'),
      status: toDbStatus(body.status),
      scheduled_start:
        body.scheduled_start ?? body.scheduledStart ?? null,
      carbon_baseline:
        body.carbon_baseline ?? body.carbonBaseline ?? null,
      carbon_optimized:
        body.carbon_optimized ?? body.carbonOptimized ?? null,
    };

    const savedPayload = await insertJobWithFallback(payload)
    const metrics = await estimateJobMetrics(savedPayload as JobRow)

    return NextResponse.json({ success: true, job: toFrontendJob(savedPayload as JobRow, metrics) }, { status: 201 });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error('Supabase POST Error:', message);
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

    const { error } = await supabaseServer
      .from('jobs')
      .delete()
      .in('job_id', jobIds);

    if (error) throw error;

    return NextResponse.json({ deleted: jobIds });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error('Supabase DELETE Error:', message);
    return NextResponse.json({ error: `Failed to delete jobs: ${message}` }, { status: 500 });
  }
}
