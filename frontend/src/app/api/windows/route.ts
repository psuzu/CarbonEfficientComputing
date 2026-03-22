import { NextResponse } from "next/server";
import { supabaseServer, formatSupabaseError } from "@/lib/supabase-server";

export type ReservedWindow = {
  jobId: number;
  windowStart: number; // forecast hour
  windowEnd: number;   // forecast hour (exclusive)
  status: string;
};

export async function GET() {
  try {
    const { data, error } = await supabaseServer
      .from("jobs")
      .select("job_id, scheduled_start, runtime_hours, status")
      .eq("status", "RUNNING");

    if (error) throw error;

    const windows: ReservedWindow[] = (data ?? [])
      .filter((r) => r.scheduled_start != null && r.runtime_hours != null)
      .map((r) => ({
        jobId: Number(r.job_id),
        windowStart: Number(r.scheduled_start),
        windowEnd: Number(r.scheduled_start) + Number(r.runtime_hours),
        status: String(r.status),
      }));

    return NextResponse.json(windows);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: formatSupabaseError(error) },
      { status: 500 }
    );
  }
}
