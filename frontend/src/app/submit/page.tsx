"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { carbonForecast } from "@/lib/mock-data";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Leaf } from "lucide-react";

export default function SubmitJobPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    cpus: 16,
    runtime: 4,
    flexibility: "semi-flexible",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(`/report?cpus=${form.cpus}&runtime=${form.runtime}&flex=${form.flexibility}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
      <h1 className="text-3xl font-bold">Submit a Job</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Job Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
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
                  onChange={(e) => setForm({ ...form, flexibility: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="rigid">Rigid — must run now</option>
                  <option value="semi-flexible">Semi-flexible — up to 6hr delay</option>
                  <option value="flexible">Flexible — up to 24hr delay</option>
                </select>
              </div>

              <Button type="submit" className="w-full" size="lg">
                <Leaf className="size-4 mr-2" /> Submit Job
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Carbon Forecast Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">48-Hour Carbon Intensity Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Lower values = cleaner electricity. The scheduler will try to place your job in green windows.
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={carbonForecast}>
                  <defs>
                    <linearGradient id="carbonGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="hour" fontSize={12} tickFormatter={(h) => `${h}h`} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${v}`} />
                  <Tooltip
                    contentStyle={{ borderRadius: "0.5rem", fontSize: "0.875rem" }}
                    formatter={(value) => [`${value} gCO₂/kWh`, "Intensity"]}
                    labelFormatter={(h) => `Hour ${h}`}
                  />
                  <Area
                    type="monotone"
                    dataKey="intensity"
                    stroke="#ef4444"
                    fill="url(#carbonGrad)"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
