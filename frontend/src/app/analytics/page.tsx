"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Activity, Clock, Leaf, TrendingDown } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClientChart } from "@/components/client-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { StoredJob } from "@/lib/job-store";
import { carbonForecast, clusterUtilization } from "@/lib/mock-data";

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      try {
        const response = await fetch("/api/jobs", { cache: "no-store" });
        const payload = (await response.json()) as StoredJob[] | { jobs?: StoredJob[]; error?: string };
        const nextJobs = Array.isArray(payload) ? payload : payload.jobs;

        if (!response.ok) {
          const message = Array.isArray(payload) ? null : payload.error;
          throw new Error(message || "Failed to load analytics jobs.");
        }

        if (!cancelled) {
          setJobs(Array.isArray(nextJobs) ? nextJobs : []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load analytics jobs.");
          setJobs([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadJobs();
    const interval = window.setInterval(() => {
      void loadJobs();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const completedJobs = useMemo(() => jobs.filter((job) => job.status === "Completed"), [jobs]);
  const totalBaseline = completedJobs.reduce((sum, job) => sum + job.carbonBaseline, 0);
  const totalSaved = completedJobs.reduce((sum, job) => sum + job.carbonSaved, 0);
  const avgReduction = totalBaseline === 0 ? 0 : Math.round((totalSaved / totalBaseline) * 100);
  const avgDelay = completedJobs.length
    ? (
        completedJobs.reduce((sum, job) => sum + (job.scheduledStart - job.submitHour), 0) /
        completedJobs.length
      ).toFixed(1)
    : "0";
  const formatBucketLabel = (label: ReactNode) => `Hour ${String(label ?? "")}`;

  const emissionsComparison = completedJobs.map((job) => ({
    job: `Job ${job.id}`,
    baseline: job.carbonBaseline,
    optimized: job.carbonOptimized,
  }));

  const analytics = {
    totalSaved,
    avgReduction,
    avgDelay,
    activeJobs: jobs.filter((job) => job.status !== "Completed").length,
    submissions: carbonForecast.map((point) => {
      const bucketJobs = jobs.filter((job) => job.submitHour === point.hour);
      return {
        label: String(point.hour),
        jobs: bucketJobs.length,
        saved: bucketJobs.reduce((sum, job) => sum + job.carbonSaved, 0),
      };
    }),
    statusBreakdown: clusterUtilization,
    emissionsComparison,
  };

  const metrics = [
    {
      title: "Jobs Submitted",
      value: String(jobs.length),
      icon: <Activity className="size-5 text-blue-500" />,
      color: "text-blue-500",
    },
    {
      title: "Total CO2 Saved",
      value: `${analytics.totalSaved.toFixed(0)}g`,
      icon: <Leaf className="size-5 text-green-500" />,
      color: "text-green-500",
    },
    {
      title: "Avg Reduction",
      value: `${analytics.avgReduction}%`,
      icon: <TrendingDown className="size-5 text-emerald-500" />,
      color: "text-emerald-500",
    },
    {
      title: "Avg Delay",
      value: `${analytics.avgDelay}h`,
      icon: <Clock className="size-5 text-amber-500" />,
      color: "text-amber-500",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Metrics below are derived from the real jobs currently stored in the scheduler database.
        </p>
      </div>

      {error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                {metric.icon}
              </div>
              <p className={`text-3xl font-bold ${metric.color}`}>
                {loading ? "..." : metric.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {(!loading && jobs.length === 0) ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No submitted jobs yet. Once jobs are created through the app, analytics will update automatically.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Submissions Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.submissions}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="label"
                    fontSize={12}
                    tickFormatter={formatBucketLabel}
                    minTickGap={24}
                  />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip
                    labelFormatter={formatBucketLabel}
                    formatter={(value, name) => [
                      name === "saved" ? `${Number(value).toFixed(0)} gCO2` : value,
                      name === "saved" ? "Saved" : "Jobs",
                    ]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="jobs"
                    stroke="#2563eb"
                    fill="#2563eb"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    name="Jobs"
                  />
                  <Area
                    type="monotone"
                    dataKey="saved"
                    stroke="#16a34a"
                    fill="#16a34a"
                    fillOpacity={0.1}
                    strokeWidth={2}
                    name="CO2 Saved"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cluster Utilization</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={analytics.statusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(hour) => `${hour}h`} />
                  <YAxis fontSize={12} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    formatter={(value) => [`${value}%`]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="cpuPercent" stroke="#3b82f6" strokeWidth={2} dot={false} name="CPU" />
                  <Line type="monotone" dataKey="gpuPercent" stroke="#a855f7" strokeWidth={2} dot={false} name="GPU" />
                </LineChart>
              </ResponsiveContainer>
            </ClientChart>
            <p className="mt-3 text-sm text-muted-foreground">
              {loading ? "Loading live job status..." : `${analytics.activeJobs} active jobs are still queued or running.`}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Recent Emissions: Baseline vs Optimized</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.emissionsComparison}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="job" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(value) => `${value}g`} />
                  <Tooltip formatter={(value) => [`${value}g CO2`]} />
                  <Legend />
                  <Bar dataKey="baseline" fill="#ef4444" fillOpacity={0.7} name="Baseline" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="optimized" fill="#22c55e" fillOpacity={0.7} name="Optimized" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
