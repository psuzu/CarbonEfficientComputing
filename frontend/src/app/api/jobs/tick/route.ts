import { NextResponse } from "next/server";
import { supabaseServer, formatSupabaseError } from "@/lib/supabase-server";

const MAX_CONCURRENT = 3;
// 1 forecast-hour = 15 real seconds of simulation
const SECONDS_PER_FORECAST_HOUR = 15;

export async function POST() {
  try {
    const now = new Date();

    // 1. Fetch all active jobs
    const { data: activeJobs, error: fetchError } = await supabaseServer
      .from("jobs")
      .select("*")
      .in("status", ["RUNNING", "QUEUED", "SCHEDULED"]);

    if (fetchError) throw fetchError;

    const running = (activeJobs ?? []).filter((j) => j.status === "RUNNING");
    const queued = (activeJobs ?? []).filter((j) => j.status === "QUEUED" || j.status === "SCHEDULED");

    // 2. Complete any RUNNING jobs whose simulated time has elapsed
    const completedIds: number[] = [];
    for (const job of running) {
      // If no started_at, backfill it now so the clock starts
      if (!job.started_at) {
        await supabaseServer
          .from("jobs")
          .update({ started_at: now.toISOString() })
          .eq("job_id", Number(job.job_id ?? job.id));
        continue;
      }
      const startedAt = new Date(job.started_at);
      const elapsedSeconds = (now.getTime() - startedAt.getTime()) / 1000;
      const runtimeHours = Number(job.runtime_hours ?? 1);
      const simulatedDuration = Math.min(
        Math.max(runtimeHours * SECONDS_PER_FORECAST_HOUR, 60),
        120
      );
      if (elapsedSeconds >= simulatedDuration) {
        completedIds.push(Number(job.job_id ?? job.id));
      }
    }

    if (completedIds.length > 0) {
      await supabaseServer
        .from("jobs")
        .update({ status: "COMPLETED", completed_at: now.toISOString() })
        .in("job_id", completedIds);
    }

    // 3. Promote queued jobs into open slots
    const remainingRunning = running.length - completedIds.length;
    const openSlots = Math.max(0, MAX_CONCURRENT - remainingRunning);

    // Sort queued by complexity then created_at (low complexity FIFO first)
    const sortedQueued = [...queued].sort((a, b) => {
      const aLow = isLowComplexity(a) ? 0 : 1;
      const bLow = isLowComplexity(b) ? 0 : 1;
      if (aLow !== bLow) return aLow - bLow;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const toPromote = sortedQueued.slice(0, openSlots);
    const promotedIds: number[] = [];
    for (const job of toPromote) {
      const id = Number(job.job_id ?? job.id);
      await supabaseServer
        .from("jobs")
        .update({ status: "RUNNING", started_at: now.toISOString() })
        .eq("job_id", id);
      promotedIds.push(id);
    }

    return NextResponse.json({
      completed: completedIds,
      promoted: promotedIds,
      runningCount: remainingRunning + promotedIds.length,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: formatSupabaseError(error) },
      { status: 500 }
    );
  }
}

function isLowComplexity(job: Record<string, unknown>) {
  const flex = String(job.flexibility_class ?? "semi-flexible");
  const cpus = Number(job.requested_cpus ?? 0);
  return flex === "flexible" && cpus <= 32;
}
