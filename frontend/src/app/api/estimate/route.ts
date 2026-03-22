import { NextResponse } from "next/server";
import { createJob } from "@/lib/job-store";
import { estimateSubmission } from "@/lib/carbon-estimation";
import { analyzeJobArchive } from "@/lib/job-analysis";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const archive = formData.get("archive");
    const jobName = String(formData.get("jobName") || "").trim();
    const cpus = Number(formData.get("cpus"));
    const runtimeHours = Number(formData.get("runtimeHours"));
    const flexibilityClass = String(formData.get("flexibilityClass") || "");
    const latestStartHour = Number(formData.get("latestStartHour"));

    if (!(archive instanceof File)) {
      return NextResponse.json({ error: "A .zip archive is required" }, { status: 400 });
    }
    if (!jobName) {
      return NextResponse.json({ error: "jobName is required" }, { status: 400 });
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
    if (!Number.isInteger(latestStartHour) || latestStartHour < 0 || latestStartHour > 47) {
      return NextResponse.json(
        { error: "latestStartHour must be an integer between 0 and 47" },
        { status: 400 },
      );
    }

    const archiveBuffer = Buffer.from(await archive.arrayBuffer());
    const analysis = analyzeJobArchive(archiveBuffer, archive.name, cpus, runtimeHours) as {
      recommended_cpus: number;
      estimated_runtime_hours: number;
      workload_class: string;
      warnings: string[];
      analysis_source: string;
      intensity_label: string;
    };

    const effectiveCpus = Math.max(cpus, Number(analysis.recommended_cpus));
    const effectiveRuntimeHours = Math.max(runtimeHours, Number(analysis.estimated_runtime_hours));

    const estimate = estimateSubmission({
      cpus: effectiveCpus,
      runtime_hours: effectiveRuntimeHours,
      submit_hour: 0,
      flexibility_class: flexibilityClass as "rigid" | "semi-flexible" | "flexible",
      latest_start_hour: latestStartHour,
    }) as Record<string, string | number>;

    const job = await createJob({
      jobName,
      archiveName: archive.name,
      submittedCpus: cpus,
      submittedRuntimeHours: runtimeHours,
      requestedCpus: effectiveCpus,
      runtimeHours: effectiveRuntimeHours,
      flexibilityClass: flexibilityClass as "rigid" | "semi-flexible" | "flexible",
      workloadClass: String(analysis.workload_class),
      intensityLabel: String(analysis.intensity_label),
      carbonBaseline: Number(estimate.baseline_emissions_gco2e),
      carbonOptimized: Number(estimate.optimized_emissions_gco2e),
      carbonSaved: Number(estimate.carbon_saved_gco2e),
      scheduledStart: Number(estimate.scheduled_start_hour),
      latestStartHour: Number(estimate.latest_start_hour ?? latestStartHour),
      delayHours: Number(estimate.delay_hours),
    });

    return NextResponse.json({
      ...estimate,
      jobId: job.id,
      jobName: job.jobName,
      archiveName: job.archiveName,
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
  }
}
