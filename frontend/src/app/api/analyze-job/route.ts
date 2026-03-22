import { NextResponse } from "next/server";
import { analyzeJobArchive } from "../../../lib/job-analysis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const archive = formData.get("archive");
    const cpus = Number(formData.get("cpus"));
    const runtimeHours = Number(formData.get("runtimeHours"));

    if (!(archive instanceof File)) {
      return NextResponse.json({ error: "A .zip archive is required" }, { status: 400 });
    }
    if (!archive.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Uploaded file must be a .zip archive" }, { status: 400 });
    }

    const archiveBuffer = Buffer.from(await archive.arrayBuffer());
    const analysis = analyzeJobArchive(
      archiveBuffer,
      archive.name,
      Number.isInteger(cpus) && cpus > 0 ? cpus : undefined,
      Number.isInteger(runtimeHours) && runtimeHours > 0 ? runtimeHours : undefined,
    );

    return NextResponse.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze uploaded job";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
