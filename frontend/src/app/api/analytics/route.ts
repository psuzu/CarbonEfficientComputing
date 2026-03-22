import { NextResponse } from "next/server";
import { supabaseServer, formatSupabaseError } from "@/lib/supabase-server";

export async function GET() {
  try {
    const { data: jobs, error } = await supabaseServer
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;

    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ summary: null, jobs: [], carbonTimeline: [] });
    }

    const totalBaseline = jobs.reduce((s, j) => s + Number(j.carbon_baseline ?? 0), 0);
    const totalOptimized = jobs.reduce((s, j) => s + Number(j.carbon_optimized ?? 0), 0);
    const totalSaved = totalBaseline - totalOptimized;
    const avgPct = totalBaseline > 0 ? (totalSaved / totalBaseline) * 100 : 0;
    const delayed = jobs.filter((j) => Number(j.scheduled_start ?? 0) > Number(j.submit_hour ?? 0));
    const avgDelay = delayed.length
      ? delayed.reduce((s, j) => s + Math.max(Number(j.scheduled_start ?? 0) - Number(j.submit_hour ?? 0), 0), 0) / delayed.length
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
        id: j.job_id ?? j.id,
        baseline: Number(j.carbon_baseline ?? 0),
        optimized: Number(j.carbon_optimized ?? 0),
      })),
    });
  } catch (error: unknown) {
    const message = formatSupabaseError(error);
    console.error("Analytics GET Error:", message);
    return NextResponse.json({ error: `Failed to fetch analytics: ${message}` }, { status: 500 });
  }
}
