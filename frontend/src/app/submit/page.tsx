"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Upload } from "lucide-react";
import { Area, AreaChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientChart } from "@/components/client-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { carbonForecast } from "@/lib/mock-data";

type AnalysisResult = {
  analysis_source: string;
  recommended_cpus: number;
  estimated_runtime_hours: number;
  submit_hour?: number | null;
  flexibility_class?: string | null;
  error?: string;
};

export default function SubmitJobPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    jobName: "Demo Job",
    cpus: 16,
    runtime: 4,
    flexibility: "semi-flexible",
    latestStart: 12,
  });
  const [fileName, setFileName] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const currentWarnings = analysis
    ? [
        ...(form.cpus < analysis.recommended_cpus
          ? [
              `Requested CPUs (${form.cpus}) may be too low for this job. Recommended minimum is ${analysis.recommended_cpus}.`,
            ]
          : []),
        ...(form.runtime < analysis.estimated_runtime_hours
          ? [
              `Requested runtime (${form.runtime}h) may be too short. Estimated minimum runtime is ${analysis.estimated_runtime_hours}h.`,
            ]
          : []),
      ]
    : [];
  const visibleForecast = carbonForecast.filter((point) => point.hour <= form.latestStart);
  const intensities = visibleForecast.map((point) => point.intensity);
  const sortedIntensities = [...intensities].sort((left, right) => left - right);
  const greenThreshold =
    sortedIntensities.length > 0
      ? sortedIntensities[Math.max(0, Math.floor((sortedIntensities.length - 1) * 0.35))]
      : 0;

  let bestWindowStart = 0;
  let bestWindowScore = Number.POSITIVE_INFINITY;
  const candidateEnd = Math.max(0, form.latestStart - form.runtime + 1);
  for (let startHour = 0; startHour <= candidateEnd; startHour += 1) {
    const window = carbonForecast.slice(startHour, startHour + form.runtime);
    if (window.length < form.runtime) {
      continue;
    }
    const score = window.reduce((sum, point) => sum + point.intensity, 0);
    if (score < bestWindowScore) {
      bestWindowScore = score;
      bestWindowStart = startHour;
    }
  }

  const chartData = carbonForecast.map((point) => ({
    ...point,
    regularIntensity: point.intensity > greenThreshold ? point.intensity : null,
    greenIntensity: point.intensity <= greenThreshold ? point.intensity : null,
  }));

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) {
      return;
    }

    setFile(selectedFile);
    setFileName(selectedFile.name);
    setForm((current) => ({
      ...current,
      jobName:
        current.jobName === "Demo Job" || current.jobName.trim() === ""
          ? selectedFile.name.replace(/\.zip$/i, "")
          : current.jobName,
    }));
    setAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("archive", selectedFile);
      formData.append("cpus", String(form.cpus));
      formData.append("runtimeHours", String(form.runtime));

      const response = await fetch("/api/analyze-job", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as AnalysisResult & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Job analysis failed");
      }

      setAnalysis(payload);
      setForm((current) => ({
        ...current,
        cpus: Math.max(current.cpus, payload.recommended_cpus),
        runtime: Math.max(current.runtime, payload.estimated_runtime_hours),
      }));
    } catch (analysisError) {
      setAnalysis(null);
      setError(analysisError instanceof Error ? analysisError.message : "Job analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      if (file === null) {
        throw new Error("Upload a .zip job archive first");
      }

      const formData = new FormData();
      formData.append("archive", file);
      formData.append("jobName", form.jobName);
      formData.append("cpus", String(form.cpus));
      formData.append("runtimeHours", String(form.runtime));
      formData.append("flexibilityClass", form.flexibility);
      formData.append("latestStartHour", String(form.latestStart));

      const response = await fetch("/api/estimate", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as Record<string, string | number | string[]>;
      if (!response.ok) {
        throw new Error(String(payload.error ?? "Job estimation failed"));
      }

      const params = new URLSearchParams({
        cpus: String(payload.recommendedCpus ?? form.cpus),
        runtime: String(payload.estimatedRuntimeHours ?? form.runtime),
        flex: String(form.flexibility),
        baseline: String(payload.baseline_emissions_gco2e),
        optimized: String(payload.optimized_emissions_gco2e),
        saved: String(payload.carbon_saved_gco2e),
        scheduledStart: String(payload.scheduled_start_hour),
        delay: String(payload.delay_hours),
        submittedCpus: String(payload.submittedCpus ?? form.cpus),
        submittedRuntime: String(payload.submittedRuntimeHours ?? form.runtime),
        workloadClass: String(payload.workloadClass ?? ""),
        intensityLabel: String(payload.intensityLabel ?? ""),
        warnings: Array.isArray(payload.warnings) ? payload.warnings.join(" | ") : "",
        jobId: String(payload.jobId ?? ""),
        jobName: String(payload.jobName ?? form.jobName),
        archiveName: String(payload.archiveName ?? file.name),
        latestStartHour: String(payload.latest_start_hour ?? form.latestStart),
      });
      router.push(`/report?${params.toString()}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Job estimation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-bold">Submit a Job</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Job Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1">Job Name</label>
                <input
                  type="text"
                  value={form.jobName}
                  onChange={(event) => setForm({ ...form, jobName: event.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Requested CPUs</label>
                <input
                  type="number" min={1} max={256} value={form.cpus}
                  onChange={(e) => setForm({ ...form, cpus: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Runtime (hours)</label>
                <input
                  type="number" min={1} max={48} value={form.runtime}
                  onChange={(e) => setForm({ ...form, runtime: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Flexibility Class</label>
                <select
                  value={form.flexibility}
                  onChange={(event) => setForm({ ...form, flexibility: event.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="rigid">Rigid - must run now</option>
                  <option value="semi-flexible">Semi-flexible - up to 6hr delay</option>
                  <option value="flexible">Flexible - up to 24hr delay</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Must Start By Forecast Hour
                </label>
                <div className="space-y-2">
                  <input
                    type="range"
                    min={0}
                    max={47}
                    value={form.latestStart}
                    onChange={(event) => setForm({ ...form, latestStart: Number(event.target.value) })}
                    className="w-full"
                  />
                  <input
                    type="number"
                    min={0}
                    max={47}
                    value={form.latestStart}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        latestStart: Math.max(0, Math.min(47, Number(event.target.value) || 0)),
                      })
                    }
                    className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Code (zip file)</label>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-md border-input hover:border-primary/50 cursor-pointer transition-colors bg-background">
                  <Upload className="size-5 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">
                    {fileName ?? "Click to upload .zip"}
                  </span>
                  <input type="file" accept=".zip" onChange={handleFileChange} className="hidden" />
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sample uploads are listed in <code>data/sample_job_submission.csv</code>.
                </p>
              </div>
              
              {submissionError ? (
                <p className="text-sm text-destructive">{submissionError}</p>
              ) : null}

              <Button type="submit" className="w-full" size="lg">
                <Leaf className="size-4 mr-2" /> Submit Job
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">48-Hour Carbon Intensity Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Lower values mean cleaner electricity. The scheduler searches for the cleanest window
              before hour {form.latestStart}. Values at or below {greenThreshold} gCO2/kWh are
              treated as green.
            </p>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="carbonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <ReferenceArea
                    x1={bestWindowStart}
                    x2={bestWindowStart + Math.max(0, form.runtime - 1)}
                    fill="#22c55e"
                    fillOpacity={0.12}
                  />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(hour) => `${hour}h`} />
                  <YAxis fontSize={12} tickFormatter={(value) => `${value}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
                    formatter={(value) => [`${value} gCO2/kWh`, "Intensity"]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="regularIntensity"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="belowThreshold"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="greenIntensity"
                    stroke="#22c55e"
                    fill="none"
                    strokeWidth={3}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
            <p className="text-xs text-muted-foreground mt-3">
              Green window formula: an hour is marked green when its carbon intensity is at or
              below the 35th percentile of all intensities available before your chosen deadline.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
