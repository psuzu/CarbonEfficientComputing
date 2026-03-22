import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { runPythonScript } from "@/lib/python";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let tempArchivePath: string | null = null;

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

    tempArchivePath = path.join(tmpdir(), `${randomUUID()}-${archive.name}`);
    await writeFile(tempArchivePath, Buffer.from(await archive.arrayBuffer()));

    const repoRoot = path.resolve(process.cwd(), "..");
    const analysis = await runPythonScript(
      repoRoot,
      "job_analyzer.py",
      JSON.stringify({
        archive_path: tempArchivePath,
        requested_cpus: Number.isInteger(cpus) && cpus > 0 ? cpus : undefined,
        runtime_hours: Number.isInteger(runtimeHours) && runtimeHours > 0 ? runtimeHours : undefined,
      }),
    );

    return NextResponse.json(JSON.parse(analysis));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze uploaded job";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempArchivePath !== null) {
      await unlink(tempArchivePath).catch(() => undefined);
    }
  }
}
