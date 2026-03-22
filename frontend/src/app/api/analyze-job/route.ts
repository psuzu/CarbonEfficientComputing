import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function runAnalyzer(repoRoot: string, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [path.join(repoRoot, "job_analyzer.py")], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `job_analyzer.py exited with code ${code}`));
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}

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
    const analysis = await runAnalyzer(
      repoRoot,
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
