import { NextResponse } from "next/server";
import { listJobs } from "@/lib/job-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ jobs: await listJobs() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load jobs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
