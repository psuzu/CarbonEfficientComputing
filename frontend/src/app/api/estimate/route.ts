import { randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function runPythonScript(
  repoRoot: string,
  scriptName: string,
  payload: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [path.join(repoRoot, scriptName)], {
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
      reject(new Error(stderr.trim() || `${scriptName} exited with code ${code}`));
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
    const flexibilityClass = String(formData.get("flexibilityClass") || "");

    if (!(archive instanceof File)) {
      return NextResponse.json({ error: "A .zip archive is required" }, { status: 400 });
    }
    if (!archive.name.endsWith(".zip")) {
      return NextResponse.json({ error: "Uploaded file must be a .zip archive" }, { status: 400 });
    }
    if (!Number.isInteger(cpus) || cpus < 1) {
      return NextResponse.json({ error: "cpus must be a positive integer" }, { status: 400 });
    }
    if (!Number.isInteger(runtimeHours) || runtimeHours < 1) {
      return NextResponse.json(
        { error: "runtimeHours must be a positive integer" },
        { status: 400 },
      );
    }
    if (!["rigid", "semi-flexible", "flexible"].includes(flexibilityClass)) {
      return NextResponse.json(
        { error: "flexibilityClass must be rigid, semi-flexible, or flexible" },
        { status: 400 },
      );
    }

    tempArchivePath = path.join(tmpdir(), `${randomUUID()}-${archive.name}`);
    await writeFile(tempArchivePath, Buffer.from(await archive.arrayBuffer()));

    const repoRoot = path.resolve(process.cwd(), "..");
    const analysis = JSON.parse(
      await runPythonScript(
        repoRoot,
        "job_analyzer.py",
        JSON.stringify({
          archive_path: tempArchivePath,
          requested_cpus: cpus,
          runtime_hours: runtimeHours,
        }),
      ),
    ) as {
      recommended_cpus: number;
      estimated_runtime_hours: number;
      workload_class: string;
      warnings: string[];
      analysis_source: string;
      intensity_label: string;
    };

    const effectiveCpus = Math.max(cpus, Number(analysis.recommended_cpus));
    const effectiveRuntimeHours = Math.max(runtimeHours, Number(analysis.estimated_runtime_hours));

    const estimate = JSON.parse(
      await runPythonScript(
        repoRoot,
        "estimator.py",
        JSON.stringify({
          cpus: effectiveCpus,
          runtime_hours: effectiveRuntimeHours,
          submit_hour: 0,
          flexibility_class: flexibilityClass,
        }),
      ),
    ) as Record<string, string | number>;

    return NextResponse.json({
      ...estimate,
      analysisSource: analysis.analysis_source,
      intensityLabel: analysis.intensity_label,
      workloadClass: analysis.workload_class,
      recommendedCpus: analysis.recommended_cpus,
      estimatedRuntimeHours: analysis.estimated_runtime_hours,
      submittedCpus: cpus,
      submittedRuntimeHours: runtimeHours,
      warnings: analysis.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to estimate uploaded job";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (tempArchivePath !== null) {
      await unlink(tempArchivePath).catch(() => undefined);
    }
  }
}
