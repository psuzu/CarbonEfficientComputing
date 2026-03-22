import { NextResponse } from "next/server";
import db from "@/lib/db";

const TOTAL_NODES = 40;
const TOTAL_PROCESSORS = 1280;
const TOTAL_GPUS = 32;
const CPUS_PER_NODE = TOTAL_PROCESSORS / TOTAL_NODES;

export async function GET() {
  const running = db.prepare("SELECT COUNT(*) as c, SUM(requestedCpus) as cpus FROM jobs WHERE status = 'Running'").get() as { c: number; cpus: number };
  const queued = db.prepare("SELECT COUNT(*) as c FROM jobs WHERE status = 'Queued'").get() as { c: number };

  const processorsInUse = Math.min(running.cpus ?? 0, TOTAL_PROCESSORS);
  const nodesInUse = Math.min(Math.ceil(processorsInUse / CPUS_PER_NODE), TOTAL_NODES);
  // GPUs scale proportionally with processor usage
  const gpusInUse = Math.round((processorsInUse / TOTAL_PROCESSORS) * TOTAL_GPUS);

  return NextResponse.json({
    totalNodes: TOTAL_NODES,
    nodesInUse,
    totalProcessors: TOTAL_PROCESSORS,
    processorsInUse,
    totalGpus: TOTAL_GPUS,
    gpusInUse,
    jobsRunning: running.c,
    jobsQueued: queued.c,
  });
}
