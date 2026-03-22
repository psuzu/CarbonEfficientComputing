"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Upload } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClientChart } from "@/components/client-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { carbonForecast } from "@/lib/mock-data";

type AnalysisResult = {
  analysis_source: string;
  recommended_cpus: number;
  estimated_runtime_hours: number;
  workload_class?: string | null;
  archive_name?: string | null;
  submit_hour?: number | null;
  flexibility_class?: string | null;
  error?: string;
};

export default function SubmitJobPage() {
  const router = useRouter();
  const lowCarbonThreshold = 100;
  const chartAxisTextStyle = {
    fill: "var(--foreground)",
    fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif",
    fontSize: 13,
    fontWeight: 600,
  } as const;
  const carbonChartData = carbonForecast.reduce<
    Array<{
      hour: number;
      intensity: number;
      aboveThreshold: number | null;
      belowThreshold: number | null;
    }>
  >((points, point, index) => {
    const decoratePoint = (hour: number, intensity: number) => ({
      hour,
      intensity,
      aboveThreshold: intensity >= lowCarbonThreshold ? intensity : null,
      belowThreshold: intensity <= lowCarbonThreshold ? intensity : null,
    });

    if (index === 0) {
      points.push(decoratePoint(point.hour, point.intensity));
      return points;
    }

    const previousPoint = carbonForecast[index - 1];
    const crossedThreshold =
      (previousPoint.intensity - lowCarbonThreshold) * (point.intensity - lowCarbonThreshold) < 0;

    if (crossedThreshold) {
      const crossingHour =
        previousPoint.hour +
        ((lowCarbonThreshold - previousPoint.intensity) * (point.hour - previousPoint.hour)) /
          (point.intensity - previousPoint.intensity);

      points.push(decoratePoint(Number(crossingHour.toFixed(2)), lowCarbonThreshold));
    }

    points.push(decoratePoint(point.hour, point.intensity));
    return points;
  }, []);
  const lowCarbonWindows = carbonForecast.reduce<Array<{ startHour: number; endHour: number }>>(
    (windows, point, index) => {
      if (point.intensity >= lowCarbonThreshold) {
        return windows;
      }

      const previousPoint = carbonForecast[index - 1];
      const activeWindow = windows[windows.length - 1];

      if (!previousPoint || previousPoint.intensity >= lowCarbonThreshold || !activeWindow) {
        windows.push({ startHour: point.hour, endHour: point.hour });
        return windows;
      }

      activeWindow.endHour = point.hour;
      return windows;
    },
    []
  );

  const [submitterName, setSubmitterName] = useState("");
  const [form, setForm] = useState({
    cpus: 16,
    runtime: 4,
    flexibility: "semi-flexible",
    complexity: "HIGH",
  });
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [archive, setArchive] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setArchive(file);
    setFileName(file?.name ?? null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);
    const now = new Date();

    let payload = {
      submitter_name: submitterName || "Anonymous Researcher",
      requested_cpus: form.cpus,
      runtime_hours: form.runtime,
      flexibility_class: form.flexibility,
      complexity_class: form.complexity,
      submit_hour: now.getHours(),
      workload_class: "generic",
      source_archive: archive?.name ?? null,
      file_bytes: archive?.size ?? 0,
    };

    if (archive) {
      try {
        const formData = new FormData();
        formData.append("archive", archive);
        formData.append("cpus", String(form.cpus));
        formData.append("runtimeHours", String(form.runtime));
        formData.append("flexibilityClass", form.flexibility);

        const analysisResponse = await fetch("/api/analyze-job", {
          method: "POST",
          body: formData,
        });

        const analysis = (await analysisResponse.json()) as AnalysisResult;
        if (analysisResponse.ok && !analysis.error) {
          payload = {
            ...payload,
            requested_cpus: Number(analysis.recommended_cpus ?? form.cpus),
            runtime_hours: Number(analysis.estimated_runtime_hours ?? form.runtime),
            workload_class: analysis.workload_class ?? payload.workload_class,
            source_archive: analysis.archive_name ?? archive.name,
            file_bytes: archive.size,
            submit_hour:
              analysis.analysis_source === "manifest" && Number.isInteger(analysis.submit_hour)
                ? Number(analysis.submit_hour)
                : payload.submit_hour,
            flexibility_class:
              analysis.analysis_source === "manifest" && analysis.flexibility_class
                ? analysis.flexibility_class
                : payload.flexibility_class,
          };
        } else {
          const message = analysis.error || "Job analysis failed for the uploaded archive.";
          setSubmissionError(message);
          return;
        }
      } catch (error) {
        console.error("Job analysis request failed.", error);
        setSubmissionError("Uploaded job analysis failed. Please try again or submit without an archive.");
        return;
      }
    }

    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.push("/history");
        return;
      }

      const result = await response.json().catch(() => null);
      setSubmissionError(result?.error || "Failed to submit job to Supabase.");
    } catch (error) {
      console.error("Failed to submit job to Supabase.", error);
      setSubmissionError("Failed to submit job to Supabase.");
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
                <label className="block text-sm font-medium mb-1">Researcher Name</label>
                <input
                  type="text"
                  placeholder="e.g., Jane Doe or mst3k"
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Complexity Class</label>
                <select
                  value={form.complexity}
                  onChange={(event) => setForm({ ...form, complexity: event.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="HIGH">High Complexity - use carbon-aware scheduling lane</option>
                  <option value="LOW">Low Complexity - run immediately in FIFO background lane</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Requested CPUs</label>
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={form.cpus}
                  onChange={(e) => setForm({ ...form, cpus: Number(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Runtime (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={48}
                  value={form.runtime}
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
                <label className="block text-sm font-medium mb-1">Code (zip file)</label>
                <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-md border-input hover:border-primary/50 cursor-pointer transition-colors bg-background">
                  <Upload className="size-5 text-muted-foreground mb-1" />
                  <span className="text-sm text-muted-foreground">
                    {fileName ?? "Click to upload .zip"}
                  </span>
                  <input type="file" accept=".zip" onChange={handleFileChange} className="hidden" />
                </label>
                <p className="mt-2 text-xs text-muted-foreground">
                  Sample uploads: <code>data/sample_jobs/cpu_burn_job.zip</code>,{" "}
                  <code>data/sample_jobs/matrix_multiply_job.zip</code>,{" "}
                  <code>data/sample_jobs/parallel_batch_job.zip</code>
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
              Lower values mean cleaner electricity. High-complexity jobs will try to land in
              greener windows whenever capacity is available.
            </p>
            <p className="text-xs text-emerald-400/90 mb-3">
              Highlighted windows indicate forecast hours below {lowCarbonThreshold} gCO2e/kWh.
            </p>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={carbonChartData} margin={{ top: 8, right: 12, bottom: 28, left: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                  {lowCarbonWindows.map((window, index) => (
                    <ReferenceArea
                      key={`${window.startHour}-${window.endHour}-${index}`}
                      x1={window.startHour}
                      x2={window.endHour}
                      y1={0}
                      y2={lowCarbonThreshold}
                      fill="#22c55e"
                      fillOpacity={0.12}
                      strokeOpacity={0}
                    />
                  ))}
                  <XAxis
                    type="number"
                    dataKey="hour"
                    domain={[0, 47]}
                    ticks={[2, 5, 8, 11, 14, 18, 22, 26, 30, 34, 38, 42, 47]}
                    fontSize={12}
                    tick={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    tickFormatter={(hour) => `${hour}h`}
                    label={{
                      value: "Forecast hour (next 48h)",
                      position: "bottom",
                      offset: 10,
                      style: chartAxisTextStyle,
                    }}
                  />
                  <YAxis
                    fontSize={12}
                    tick={{ fill: "var(--muted-foreground)", fontFamily: "var(--font-geist-sans), Arial, Helvetica, sans-serif" }}
                    axisLine={{ stroke: "var(--border)" }}
                    tickLine={{ stroke: "var(--border)" }}
                    tickFormatter={(value) => `${value}`}
                    label={{
                      value: "Grid carbon intensity (gCO2e/kWh)",
                      angle: -90,
                      position: "left",
                      offset: 0,
                      style: chartAxisTextStyle,
                    }}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
                    formatter={(value) => [`${value} gCO2/kWh`, "Intensity"]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="none"
                    fill="#ef4444"
                    fillOpacity={0.08}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="aboveThreshold"
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
                    connectNulls={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
