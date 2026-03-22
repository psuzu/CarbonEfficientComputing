"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Leaf, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

function ReportContent() {
  const params = useSearchParams();
  const cpus = Number(params.get("cpus") || 16);
  const runtime = Number(params.get("runtime") || 4);
  const jobId = Number(params.get("jobId") || 0);
  const jobName = params.get("jobName") || "Unnamed Job";
  const archiveName = params.get("archiveName") || "unknown.zip";
  const flex = params.get("flex") || "semi-flexible";
  const submittedCpus = Number(params.get("submittedCpus") || cpus);
  const submittedRuntime = Number(params.get("submittedRuntime") || runtime);
  const workloadClass = params.get("workloadClass") || "unknown";
  const intensityLabel = params.get("intensityLabel") || "unknown";
  const warnings = (params.get("warnings") || "")
    .split(" | ")
    .map((warning) => warning.trim())
    .filter(Boolean);
  const baselineCo2 = Number(params.get("baseline") || 0);
  const optimizedCo2 = Number(params.get("optimized") || 0);
  const saved = Number(params.get("saved") || Math.max(0, baselineCo2 - optimizedCo2));
  const reduction = baselineCo2 === 0 ? 0 : Math.round((saved / baselineCo2) * 100);
  const delay = Number(params.get("delay") || 0);
  const scheduledStart = Number(params.get("scheduledStart") || 0);
  const latestStartHour = Number(params.get("latestStartHour") || scheduledStart);
  const aiExplanation = [
    `${jobName} is categorized as a ${workloadClass} workload with ${intensityLabel.toLowerCase()} carbon guidance.`,
    saved > 0
      ? `By shifting execution to forecast hour ${scheduledStart}, this plan avoids about ${saved.toLocaleString()} gCO2 compared with running immediately.`
      : "This schedule does not currently show measurable carbon savings versus an immediate start.",
    delay > 0
      ? `The tradeoff is a ${delay}-hour delay, while still staying within the latest allowed start hour of ${latestStartHour}.`
      : "No schedule delay was needed to achieve this recommendation.",
    submittedCpus !== cpus || submittedRuntime !== runtime
      ? `The estimator adjusted the job profile from ${submittedCpus} CPUs / ${submittedRuntime}h to ${cpus} CPUs / ${runtime}h based on the uploaded workload.`
      : null,
    warnings.length > 0 ? `Notes: ${warnings.join("; ")}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <Link
        href="/submit"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to Submit
      </Link>

      <h1 className="text-3xl font-bold">Scheduling Report</h1>
      <p className="text-sm text-muted-foreground">
        Job ID: {jobId} | Job Name: {jobName} | Zip File: {archiveName}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="size-5 text-primary" /> Job Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-sm text-muted-foreground">Requested CPUs</p>
              <p className="text-2xl font-bold">{cpus}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Runtime</p>
              <p className="text-2xl font-bold">{runtime}h</p>
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
              Job delayed by {delay} hours, scheduled to start at forecast hour {scheduledStart},
              and must start by hour {latestStartHour}
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
