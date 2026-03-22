"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Clock, Leaf, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Leaf, Clock, Zap, Sparkles } from "lucide-react";

type ScoreResult = {
  scheduled_start: number;
  earliest_start: number;
  optimized_intensity: number;
  baseline_intensity: number;
  baseline_co2_g: number;
  optimized_co2_g: number;
  delay_hours: number;
};

function ReportContent() {
  const params = useSearchParams();
  const cpus = Number(params.get("cpus") || 16);
  const runtime = Number(params.get("runtime") || 4);
  const flex = params.get("flex") || "semi-flexible";
  const submitHour = Number(params.get("submit_hour") || 0);
  const submitMinute = Number(params.get("submit_minute") || 0);
  const fileBytes = Number(params.get("file_bytes") || 0);

  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpus, runtime, flexibility: flex, submit_hour: submitHour, submit_minute: submitMinute, file_bytes: fileBytes }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setResult(data);
      })
      .catch((e) => setError(e.message));
  }, [cpus, runtime, flex, submitHour, submitMinute, fileBytes]);

  // Save to DB once result arrives
  const [wasSaved, setWasSaved] = useState(false);
  useEffect(() => {
    if (!result || wasSaved) return;
    fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submitHour,
        requestedCpus: cpus,
        runtimeHours: runtime,
        flexibilityClass: flex,
        status: "Completed",
        carbonBaseline: Math.round(result.baseline_co2_g),
        carbonOptimized: Math.round(result.optimized_co2_g),
        scheduledStart: result.scheduled_start,
        delayHours: result.delay_hours,
      }),
    });

    // Fetch AI carbon coach explanation
    const saved = Math.round(result.baseline_co2_g) - Math.round(result.optimized_co2_g);
    const reduction = Math.round((saved / result.baseline_co2_g) * 100);
    fetch("/api/carbon-coach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cpus, runtime, flexibility: flex,
        baselineIntensity: result.baseline_intensity,
        optimizedIntensity: result.optimized_intensity,
        scheduledStart: result.scheduled_start,
        delayHours: result.delay_hours,
        saved, reduction,
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.explanation) setAiExplanation(d.explanation); });

    setWasSaved(true);
  }, [result]);

  if (!result && !error) {
    return <div className="p-10 text-center text-muted-foreground">Calculating optimal schedule...</div>;
  }

  const powerPerCpu = 0.15;
  const energyKwh = cpus * powerPerCpu * runtime;
  const baselineCo2 = result ? Math.round(result.baseline_co2_g) : Math.round(energyKwh * 320);
  const optimizedCo2 = result ? Math.round(result.optimized_co2_g) : Math.round(energyKwh * 185);
  const saved = baselineCo2 - optimizedCo2;
  const reduction = Math.round((saved / baselineCo2) * 100);
  const delay = result ? result.delay_hours : (flex === "rigid" ? 0 : flex === "semi-flexible" ? 3 : 8);

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <Link
        href="/submit"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to Submit
      </Link>

      <h1 className="text-3xl font-bold">Scheduling Report</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="size-5 text-primary" /> Job Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground text-center">
            Detected workload: <strong>{workloadClass}</strong> ({intensityLabel})
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Recommended CPUs</p>
              <p className="text-2xl font-bold">{cpus}</p>
              {submittedCpus !== cpus ? (
                <p className="text-xs text-amber-700">You entered {submittedCpus}</p>
              ) : null}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated Runtime</p>
              <p className="text-2xl font-bold">{runtime}h</p>
              {submittedRuntime !== runtime ? (
                <p className="text-xs text-amber-700">You entered {submittedRuntime}h</p>
              ) : null}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Flexibility</p>
              <Badge
                variant={
                  flex === "rigid" ? "destructive" : flex === "semi-flexible" ? "warning" : "success"
                }
              >
                {flex}
              </Badge>
            </div>
          </div>
          {warnings.length > 0 ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm space-y-1">
              {warnings.map((warning) => (
                <p key={warning} className="text-amber-800">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-sm text-muted-foreground">Baseline Emissions</p>
            <p className="text-3xl font-bold text-destructive">{baselineCo2.toLocaleString()} g</p>
            <p className="text-xs text-muted-foreground">If run immediately</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center space-y-1">
            <p className="text-sm text-muted-foreground">Optimized Emissions</p>
            <p className="text-3xl font-bold text-primary">{optimizedCo2.toLocaleString()} g</p>
            <p className="text-xs text-muted-foreground">Scheduled in green window</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Leaf className="size-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Carbon Saved</p>
                <p className="text-2xl font-bold text-primary">{saved.toLocaleString()} gCO2</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-3xl font-bold text-primary">{reduction}%</p>
              <p className="text-sm text-muted-foreground">reduction</p>
            </div>
          </div>
          <Separator className="my-4" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="size-4" />
            <span>
              Job delayed by {delay} hours and scheduled to start at forecast hour {scheduledStart}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Carbon Coach AI explanation */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="size-5 text-primary" /> Carbon Coach
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiExplanation ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{aiExplanation}</p>
          ) : (
            <p className="text-sm text-muted-foreground animate-pulse">Generating AI insight...</p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Link href="/"><Button variant="outline">Back to Dashboard</Button></Link>
        <Link href="/history"><Button>View History</Button></Link>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={<div className="p-10 text-center text-muted-foreground">Loading report...</div>}
    >
      <ReportContent />
    </Suspense>
  );
}
