import { readZipEntries } from "@/lib/zip";

type JobAnalysisResult = {
  analysis_source: "manifest" | "heuristic";
  workload_class: string;
  intensity_label: string;
  recommended_cpus: number;
  estimated_runtime_hours: number;
  submit_hour: number | null;
  flexibility_class: string | null;
  warnings: string[];
  archive_name: string;
};

function readArchiveText(entries: ReturnType<typeof readZipEntries>) {
  return entries
    .filter((entry) => entry.name.endsWith(".py") || entry.name.endsWith(".txt") || entry.name.endsWith(".md") || entry.name.endsWith(".json"))
    .map((entry) => entry.data.toString("utf8"))
    .join("\n");
}

function analyzeHeuristically(sourceText: string) {
  const normalized = sourceText.toLowerCase();

  if (
    normalized.includes("multiprocessing")
    || normalized.includes("from multiprocessing import pool")
    || normalized.includes(" pool(")
    || normalized.includes(".map(")
  ) {
    return {
      analysis_source: "heuristic" as const,
      workload_class: "batch",
      intensity_label: "parallel_cpu",
      recommended_cpus: 4,
      estimated_runtime_hours: 1,
    };
  }

  if (
    normalized.includes("import numpy")
    || normalized.includes("from numpy")
    || normalized.includes("np.dot")
    || normalized.includes("matmul")
  ) {
    return {
      analysis_source: "heuristic" as const,
      workload_class: "dev-test",
      intensity_label: "matrix_compute",
      recommended_cpus: 2,
      estimated_runtime_hours: 1,
    };
  }

  if (/for\s+\w+\s+in\s+range\(/.test(normalized)) {
    return {
      analysis_source: "heuristic" as const,
      workload_class: "interactive",
      intensity_label: "cpu_burn",
      recommended_cpus: 1,
      estimated_runtime_hours: 1,
    };
  }

  return {
    analysis_source: "heuristic" as const,
    workload_class: "dev-test",
    intensity_label: "generic_compute",
    recommended_cpus: 1,
    estimated_runtime_hours: 1,
  };
}

export function analyzeJobArchive(
  archiveBuffer: Buffer,
  archiveName: string,
  requestedCpus?: number,
  runtimeHours?: number,
): JobAnalysisResult {
  const entries = readZipEntries(archiveBuffer);
  const manifestEntry = entries.find((entry) => entry.name.endsWith("job_manifest.json"));
  const warnings: string[] = [];

  const baseResult = manifestEntry
    ? (() => {
        const manifest = JSON.parse(manifestEntry.data.toString("utf8")) as {
          workload_class: string;
          requested_cpus: number;
          runtime_hours: number;
          submit_hour: number;
          flexibility_class: string;
        };

        return {
          analysis_source: "manifest" as const,
          workload_class: String(manifest.workload_class),
          intensity_label: String(manifest.workload_class),
          recommended_cpus: Number(manifest.requested_cpus),
          estimated_runtime_hours: Number(manifest.runtime_hours),
          submit_hour: Number(manifest.submit_hour),
          flexibility_class: String(manifest.flexibility_class),
        };
      })()
    : {
        ...analyzeHeuristically(readArchiveText(entries)),
        submit_hour: null,
        flexibility_class: null,
      };

  if (requestedCpus !== undefined && requestedCpus < baseResult.recommended_cpus) {
    warnings.push(
      `Requested CPUs (${requestedCpus}) may be too low for this job. Recommended minimum is ${baseResult.recommended_cpus}.`,
    );
  }

  if (runtimeHours !== undefined && runtimeHours < baseResult.estimated_runtime_hours) {
    warnings.push(
      `Requested runtime (${runtimeHours}h) may be too short. Estimated minimum runtime is ${baseResult.estimated_runtime_hours}h.`,
    );
  }

  return {
    ...baseResult,
    warnings,
    archive_name: archiveName,
  };
}
