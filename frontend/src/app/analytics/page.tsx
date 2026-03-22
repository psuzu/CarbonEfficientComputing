"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, Clock, Leaf, TrendingDown } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ClientChart } from "@/components/client-chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type JobRecord } from "@/lib/jobs";

type SubmissionPoint = {
  label: string;
  jobs: number;
  saved: number;
};

type StatusPoint = {
  status: string;
  jobs: number;
};

type EmissionsPoint = {
  job: string;
  baseline: number;
  optimized: number;
};

function formatBucketLabel(value: any) {
  if (!value) return "";

  const date = new Date(value);
  
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
  });
}

export default function AnalyticsPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/jobs")
      .then(async (response) => {
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load analytics.");
        }

        if (active) {
          setJobs(Array.isArray(payload) ? payload : []);
          setError(null);
        }
      })
      .catch((fetchError: unknown) => {
        if (active) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to load analytics.");
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const analytics = useMemo(() => {
    const totalBaseline = jobs.reduce((sum, job) => sum + job.carbonBaseline, 0);
    const totalOptimized = jobs.reduce((sum, job) => sum + job.carbonOptimized, 0);
    const totalSaved = totalBaseline - totalOptimized;
    const avgReduction = totalBaseline === 0 ? 0 : Math.round((totalSaved / totalBaseline) * 100);
    const delayedJobs = jobs.filter((job) => (job.delayHours ?? Math.max(job.scheduledStart - job.submitHour, 0)) > 0);
    const avgDelay = delayedJobs.length
      ? (
          delayedJobs.reduce(
            (sum, job) => sum + (job.delayHours ?? Math.max(job.scheduledStart - job.submitHour, 0)),
            0,
          ) / delayedJobs.length
        ).toFixed(1)
      : "0.0";
    const activeJobs = jobs.filter((job) => job.status !== "Completed").length;

    const submissionBuckets = new Map<string, SubmissionPoint>();
    jobs
      .filter((job) => job.createdAt)
      .sort((left, right) => new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime())
      .forEach((job) => {
        const bucketKey = new Date(job.createdAt as string);
        bucketKey.setMinutes(0, 0, 0);
        const key = bucketKey.toISOString();
        const bucket = submissionBuckets.get(key) ?? { label: key, jobs: 0, saved: 0 };
        bucket.jobs += 1;
        bucket.saved += job.carbonBaseline - job.carbonOptimized;
        submissionBuckets.set(key, bucket);
      });

    const submissions = Array.from(submissionBuckets.values()).slice(-12);

    const statuses: Array<JobRecord["status"]> = ["Queued", "Running", "Completed"];
    const statusBreakdown: StatusPoint[] = statuses.map((status) => ({
      status,
      jobs: jobs.filter((job) => job.status === status).length,
    }));

    const emissionsComparison: EmissionsPoint[] = [...jobs]
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : left.id;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : right.id;
        return rightTime - leftTime;
      })
      .slice(0, 12)
      .reverse()
      .map((job) => ({
        job: `Job ${job.id}`,
        baseline: Number(job.carbonBaseline.toFixed(1)),
        optimized: Number(job.carbonOptimized.toFixed(1)),
      }));

    return {
      totalSaved,
      avgReduction,
      avgDelay,
      activeJobs,
      submissions,
      statusBreakdown,
      emissionsComparison,
    };
  }, [jobs]);

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
            <CardTitle className="text-lg">Jobs By Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.statusBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="status" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip formatter={(value) => [value, "Jobs"]} />
                  <Bar dataKey="jobs" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
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
                  <Bar
                    dataKey="baseline"
                    fill="#ef4444"
                    fillOpacity={0.7}
                    name="Baseline"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="optimized"
                    fill="#22c55e"
                    fillOpacity={0.7}
                    name="Optimized"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
