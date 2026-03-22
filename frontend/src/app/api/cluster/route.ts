import { NextResponse } from "next/server";
import { supabaseServer, formatSupabaseError } from "@/lib/supabase-server";

const TOTAL_NODES = 40;
const TOTAL_PROCESSORS = 1280;
const TOTAL_GPUS = 32;
const CPUS_PER_NODE = TOTAL_PROCESSORS / TOTAL_NODES;

export async function GET() {
  try {
    const { data: runningJobs, error: runningError } = await supabaseServer
      .from("jobs")
      .select("requested_cpus")
      .eq("status", "RUNNING");

    if (runningError) throw runningError;

    const { count: queuedCount, error: queuedError } = await supabaseServer
      .from("jobs")
      .select("*", { count: "exact", head: true })
      .eq("status", "QUEUED");

    if (queuedError) throw queuedError;

    const totalCpus = (runningJobs ?? []).reduce((s, j) => s + Number(j.requested_cpus ?? 0), 0);
    const processorsInUse = Math.min(totalCpus, TOTAL_PROCESSORS);
    const nodesInUse = Math.min(Math.ceil(processorsInUse / CPUS_PER_NODE), TOTAL_NODES);
    const gpusInUse = Math.round((processorsInUse / TOTAL_PROCESSORS) * TOTAL_GPUS);

    return NextResponse.json({
      totalNodes: TOTAL_NODES,
      nodesInUse,
      totalProcessors: TOTAL_PROCESSORS,
      processorsInUse,
      totalGpus: TOTAL_GPUS,
      gpusInUse,
      jobsRunning: (runningJobs ?? []).length,
      jobsQueued: queuedCount ?? 0,
    });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Cluster GET Error:", message);
    return NextResponse.json({ error: `Failed to fetch cluster state: ${message}` }, { status: 500 });
  }
}
