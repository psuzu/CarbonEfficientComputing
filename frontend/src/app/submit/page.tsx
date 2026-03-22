"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Leaf, Upload } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ClientChart } from "@/components/client-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { carbonForecast } from "@/lib/mock-data";

type AnalysisResult = {
  analysis_source: string;
  intensity_label: string;
  workload_class: string;
  recommended_cpus: number;
  estimated_runtime_hours: number;
  warnings: string[];
};

export default function SubmitJobPage() {
  const router = useRouter();
  const [form, setForm] = useState({ cpus: 16, runtime: 4, flexibility: "semi-flexible" });
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileBytes, setFileBytes] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setFileName(file.name); setFileBytes(file.size); }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const now = new Date();
    const submitHour = now.getHours();
    const submitMinute = now.getMinutes();
    router.push(`/report?cpus=${form.cpus}&runtime=${form.runtime}&flex=${form.flexibility}&submit_hour=${submitHour}&submit_minute=${submitMinute}&file_bytes=${fileBytes}`);
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
              Lower values mean cleaner electricity. The scheduler will try to place your job in
              greener windows.
            </p>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={carbonForecast}>
                  <defs>
                    <linearGradient id="carbonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(hour) => `${hour}h`} />
                  <YAxis fontSize={12} tickFormatter={(value) => `${value}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
                    formatter={(value) => [`${value} gCO2/kWh`, "Intensity"]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Area type="monotone" dataKey="intensity" stroke="#ef4444" fill="url(#carbonGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
