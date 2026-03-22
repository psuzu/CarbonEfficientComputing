import { NextRequest, NextResponse } from "next/server";
import { buildSchedulePreview, buildSingleScheduleEstimate } from "../../../lib/carbon-estimation";

// GET /api/schedule  -> full batch simulation
export async function GET() {
  try {
    return NextResponse.json(buildSchedulePreview());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/schedule  -> single job estimate
// Body: { cpus: number, runtime: number, flexibility: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpus: number = Number(body.cpus);
    const runtime: number = Number(body.runtime);
    const flexibility: string = String(body.flexibility);

    if (!cpus || !runtime || !flexibility) {
      return NextResponse.json(
        { error: "Missing required fields: cpus, runtime, flexibility" },
        { status: 400 }
      );
    }

    if (!["rigid", "semi-flexible", "flexible"].includes(flexibility)) {
      return NextResponse.json({ error: "Unknown flexibility class" }, { status: 400 });
    }

    const data = buildSingleScheduleEstimate(
      cpus,
      runtime,
      flexibility as "rigid" | "semi-flexible" | "flexible",
    );

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
