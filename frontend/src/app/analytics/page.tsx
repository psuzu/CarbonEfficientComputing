"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockJobs, clusterState, clusterUtilization, carbonForecast } from "@/lib/mock-data";
import { Leaf, TrendingDown, Clock, Activity } from "lucide-react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from "recharts";

export default function AnalyticsPage() {
  const totalBaseline = mockJobs.reduce((s, j) => s + j.carbonBaseline, 0);
  const totalOptimized = mockJobs.reduce((s, j) => s + j.carbonOptimized, 0);
  const totalSaved = totalBaseline - totalOptimized;
  const avgReduction = Math.round((totalSaved / totalBaseline) * 100);
  const completedJobs = mockJobs.filter((j) => j.status === "Completed");
  const avgDelay = completedJobs.length
    ? (completedJobs.reduce((s, j) => s + (j.scheduledStart - j.submitHour), 0) / completedJobs.length).toFixed(1)
    : "0";
  const cpuUtil = Math.round((clusterState.processorsInUse / clusterState.totalProcessors) * 100);

  const emissionsComparison = mockJobs.map((j) => ({
    job: `Job ${j.id}`,
    baseline: j.carbonBaseline,
    optimized: j.carbonOptimized,
  }));

  const metrics = [
    { title: "Total CO₂ Saved", value: `${totalSaved.toFixed(0)}g`, icon: <Leaf className="size-5 text-green-500" />, color: "text-green-500" },
    { title: "Avg Reduction", value: `${avgReduction}%`, icon: <TrendingDown className="size-5 text-blue-500" />, color: "text-blue-500" },
    { title: "Avg Delay", value: `${avgDelay}h`, icon: <Clock className="size-5 text-yellow-500" />, color: "text-yellow-500" },
    { title: "CPU Utilization", value: `${cpuUtil}%`, icon: <Activity className="size-5 text-purple-500" />, color: "text-purple-500" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-bold">Analytics Dashboard</h1>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <Card key={m.title}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">{m.title}</p>
                {m.icon}
              </div>
              <p className={`text-3xl font-bold ${m.color}`}>{m.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Carbon intensity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Carbon Intensity (48h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={carbonForecast}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(h) => `${h}h`} />
                  <YAxis fontSize={12} />
                  <Tooltip formatter={(v) => [`${v} gCO₂/kWh`, "Intensity"]} labelFormatter={(h) => `Hour ${h}`} />
                  <Area type="monotone" dataKey="intensity" stroke="#ef4444" fill="#ef4444" fillOpacity={0.15} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Cluster utilization */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Cluster Utilization (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={clusterUtilization}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(h) => `${h}h`} />
                  <YAxis fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [`${v}%`]} labelFormatter={(h) => `Hour ${h}`} />
                  <Legend />
                  <Line type="monotone" dataKey="cpuPercent" stroke="#3b82f6" strokeWidth={2} dot={false} name="CPU" />
                  <Line type="monotone" dataKey="gpuPercent" stroke="#a855f7" strokeWidth={2} dot={false} name="GPU" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Emissions comparison */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Emissions: Baseline vs Optimized</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={emissionsComparison}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="job" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${v}g`} />
                  <Tooltip formatter={(v) => [`${v}g CO₂`]} />
                  <Legend />
                  <Bar dataKey="baseline" fill="#ef4444" fillOpacity={0.7} name="Baseline" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="optimized" fill="#22c55e" fillOpacity={0.7} name="Optimized" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
