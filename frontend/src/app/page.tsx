"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { clusterState } from "@/lib/mock-data";
import { Cpu, Server, MonitorDot, Activity, Upload, Clock, BarChart3 } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Separator } from "@/components/ui/separator";

const utilizationData = [
  { v: 30 }, { v: 45 }, { v: 52 }, { v: 48 }, { v: 60 }, { v: 55 }, { v: 62 }, { v: 58 }, { v: 65 },
];

type ClusterMetric = {
  title: string;
  available: number;
  total: number;
  inUse: number;
  icon: React.ReactNode;
  color: string;
};

const metrics: ClusterMetric[] = [
  {
    title: "Nodes",
    available: clusterState.totalNodes - clusterState.nodesInUse,
    total: clusterState.totalNodes,
    inUse: clusterState.nodesInUse,
    icon: <Server className="size-5" />,
    color: "#22c55e",
  },
  {
    title: "Processors",
    available: clusterState.totalProcessors - clusterState.processorsInUse,
    total: clusterState.totalProcessors,
    inUse: clusterState.processorsInUse,
    icon: <Cpu className="size-5" />,
    color: "#3b82f6",
  },
  {
    title: "GPUs",
    available: clusterState.totalGpus - clusterState.gpusInUse,
    total: clusterState.totalGpus,
    inUse: clusterState.gpusInUse,
    icon: <MonitorDot className="size-5" />,
    color: "#a855f7",
  },
];

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Carbon-Efficient Computing</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Schedule HPC jobs during low-carbon periods. Reduce emissions without sacrificing performance.
        </p>
        <div className="flex gap-3 justify-center pt-2">
          <Link href="/submit">
            <Button size="lg">Submit Job</Button>
          </Link>
          <Link href="/analytics">
            <Button variant="outline" size="lg">View Analytics</Button>
          </Link>
        </div>
      </div>

      {/* Mission Statement */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 text-center space-y-2">
          <h2 className="text-xl font-semibold">Our Mission</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Data centers account for 1-2% of global electricity use. By intelligently shifting
            flexible workloads to times when the grid is powered by renewables, we can cut HPC
            carbon emissions by up to 40% - without slowing down research.
          </p>
        </CardContent>
      </Card>

      {/* How It Works */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-center">How It Works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <Upload className="size-8 mx-auto text-primary" />
              <h3 className="font-semibold">1. Submit Your Job</h3>
              <p className="text-sm text-muted-foreground">
                Upload your code and specify resource requirements - CPUs, runtime, and how
                flexible your deadline is.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <Clock className="size-8 mx-auto text-blue-500" />
              <h3 className="font-semibold">2. Find Green Windows</h3>
              <p className="text-sm text-muted-foreground">
                The scheduler analyzes carbon intensity forecasts and finds the cleanest
                time slot within your flexibility window.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <BarChart3 className="size-8 mx-auto text-purple-500" />
              <h3 className="font-semibold">3. Track Your Impact</h3>
              <p className="text-sm text-muted-foreground">
                View detailed reports showing baseline vs optimized emissions and how much
                CO₂ your scheduling choices saved.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Separator />

      {/* Cluster Status */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">HPC Cluster Status</h2>
          <span className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
            </span>
            Live
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.map((m) => {
            const pct = Math.round((m.inUse / m.total) * 100);
            return (
              <Card key={m.title}>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center gap-2">
                    <span style={{ color: m.color }}>{m.icon}</span>
                    <span className="font-semibold">{m.title}</span>
                  </div>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Available</p>
                      <p className="text-3xl font-bold">{m.available.toLocaleString()}</p>
                      <p className="text-sm text-muted-foreground">{pct}% in use</p>
                    </div>
                    <div className="w-28 h-14">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={utilizationData}>
                          <defs>
                            <linearGradient id={`grad-${m.title}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={m.color} stopOpacity={0.3} />
                              <stop offset="100%" stopColor={m.color} stopOpacity={0.05} />
                            </linearGradient>
                          </defs>
                          <Area type="monotone" dataKey="v" stroke={m.color} fill={`url(#grad-${m.title})`} strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Jobs summary */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">Jobs Running</p>
              <p className="text-3xl font-bold">{clusterState.jobsRunning}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-sm text-muted-foreground">Jobs Queued</p>
              <p className="text-3xl font-bold">{clusterState.jobsQueued}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
