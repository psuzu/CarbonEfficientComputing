import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY id ASC").all() as {
    id: number; submitHour: number; requestedCpus: number; runtimeHours: number;
    flexibilityClass: string; status: string; carbonBaseline: number;
    carbonOptimized: number; scheduledStart: number; delayHours: number;
  }[];

  if (!jobs.length) return NextResponse.json({ summary: null, jobs: [], carbonTimeline: [] });

  const totalBaseline = jobs.reduce((s, j) => s + j.carbonBaseline, 0);
  const totalOptimized = jobs.reduce((s, j) => s + j.carbonOptimized, 0);
  const totalSaved = totalBaseline - totalOptimized;
  const avgPct = totalBaseline > 0 ? (totalSaved / totalBaseline) * 100 : 0;
  const delayed = jobs.filter((j) => j.delayHours > 0);
  const avgDelay = delayed.length
    ? delayed.reduce((s, j) => s + j.delayHours, 0) / delayed.length
    : 0;

  return NextResponse.json({
    summary: {
      totalJobs: jobs.length,
      totalBaselineG: Math.round(totalBaseline),
      totalOptimizedG: Math.round(totalOptimized),
      totalSavedG: Math.round(totalSaved),
      avgPercentSavings: Math.round(avgPct * 10) / 10,
      jobsDelayed: delayed.length,
      avgDelayHours: Math.round(avgDelay * 10) / 10,
    },
    jobs: jobs.map((j) => ({
      id: j.id,
      baseline: j.carbonBaseline,
      optimized: j.carbonOptimized,
    })),
  });
}
