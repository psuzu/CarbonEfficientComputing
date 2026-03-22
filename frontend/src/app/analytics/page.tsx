"use client";

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
import { carbonForecast, clusterState, clusterUtilization, mockJobs } from "@/lib/mock-data";

export default function AnalyticsPage() {
  const totalBaseline = mockJobs.reduce((sum, job) => sum + job.carbonBaseline, 0);
  const totalOptimized = mockJobs.reduce((sum, job) => sum + job.carbonOptimized, 0);
  const totalSaved = totalBaseline - totalOptimized;
  const avgReduction = totalBaseline === 0 ? 0 : Math.round((totalSaved / totalBaseline) * 100);
  const completedJobs = mockJobs.filter((job) => job.status === "Completed");
  const avgDelay = completedJobs.length
    ? (
        completedJobs.reduce((sum, job) => sum + (job.scheduledStart - job.submitHour), 0) /
        completedJobs.length
      ).toFixed(1)
    : "0";
  const cpuUtil = Math.round((clusterState.processorsInUse / clusterState.totalProcessors) * 100);

  const emissionsComparison = mockJobs.map((job) => ({
    job: `Job ${job.id}`,
    baseline: job.carbonBaseline,
    optimized: job.carbonOptimized,
  }));

  const metrics = [
    {
      title: "Total CO2 Saved",
      value: `${totalSaved.toFixed(0)}g`,
      icon: <Leaf className="size-5 text-green-500" />,
      color: "text-green-500",
    },
    {
      title: "Avg Reduction",
      value: `${avgReduction}%`,
      icon: <TrendingDown className="size-5 text-blue-500" />,
      color: "text-blue-500",
    },
    {
      title: "Avg Delay",
      value: `${avgDelay}h`,
      icon: <Clock className="size-5 text-yellow-500" />,
      color: "text-yellow-500",
    },
    {
      title: "CPU Utilization",
      value: `${cpuUtil}%`,
      icon: <Activity className="size-5 text-purple-500" />,
      color: "text-purple-500",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-bold">Analytics Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <Card key={metric.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{metric.title}</p>
                {metric.icon}
              </div>
              <p className={`text-3xl font-bold ${metric.color}`}>{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Carbon Intensity (48h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={carbonForecast}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(hour) => `${hour}h`} />
                  <YAxis fontSize={12} />
                  <Tooltip
                    formatter={(value) => [`${value} gCO2/kWh`, "Intensity"]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.15}
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cluster Utilization (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={clusterUtilization}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(hour) => `${hour}h`} />
                  <YAxis fontSize={12} domain={[0, 100]} tickFormatter={(value) => `${value}%`} />
                  <Tooltip
                    formatter={(value) => [`${value}%`]}
                    labelFormatter={(hour) => `Hour ${hour}`}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="cpuPercent"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="CPU"
                  />
                  <Line
                    type="monotone"
                    dataKey="gpuPercent"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={false}
                    name="GPU"
                  />
                </LineChart>
              </ResponsiveContainer>
            </ClientChart>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Emissions: Baseline vs Optimized</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientChart className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emissionsComparison}>
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
