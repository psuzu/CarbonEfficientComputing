"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { type JobRecord } from "@/lib/jobs";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

type LiveJob = JobRecord & {
  jobName?: string;
  archiveName?: string;
  workloadClass?: string;
  complexity?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  queuePosition?: number | null;
};

// 1 forecast-hour = 15 real seconds of simulation
const SECONDS_PER_FORECAST_HOUR = 15;

type SortableJobKey = Exclude<keyof LiveJob, "delayHours">;

function getSimulatedDurationSeconds(runtimeHours: number) {
  return Math.min(Math.max(runtimeHours * SECONDS_PER_FORECAST_HOUR, 60), 120);
}

function getRunningProgress(job: LiveJob, nowMs: number) {
  if (job.status === "Completed") {
    return { percent: 100, remainingSeconds: 0 };
  }

  if (job.status !== "Running" || !job.startedAt) {
    return { percent: 0, remainingSeconds: null };
  }

  const durationSeconds = getSimulatedDurationSeconds(job.runtimeHours);
  const elapsedSeconds = Math.max(
    0,
    (nowMs - new Date(job.startedAt).getTime()) / 1000,
  );
  const percent = Math.max(
    0,
    Math.min(100, Math.round((elapsedSeconds / durationSeconds) * 100)),
  );
  const remainingSeconds = Math.max(0, Math.ceil(durationSeconds - elapsedSeconds));

  return { percent, remainingSeconds };
}

function ProgressCell({ job, nowMs }: { job: LiveJob; nowMs: number }) {
  const { percent, remainingSeconds } = getRunningProgress(job, nowMs);

  if (job.status === "Queued") {
    return <span className="text-xs text-muted-foreground">Waiting for capacity</span>;
  }

  if (job.status === "Completed") {
    return (
      <div className="min-w-32">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">100%</span>
          <span className="text-green-600">Done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full rounded-full bg-green-500" />
        </div>
      </div>
    );
  }

  if (remainingSeconds === null) return null;

  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  return (
    <div className="min-w-32">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{percent}%</span>
        <span className="font-mono text-blue-500">
          {mins > 0 ? `${mins}m ` : ""}{secs}s left
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-1000 ease-linear"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<LiveJob[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortableJobKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const pageSize = 10;

  const fetchJobs = useCallback(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setJobs(data); });
  }, []);

  // Tick simulation + refresh every 10s
  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 10_000);
    return () => clearInterval(id);
  }, [fetchJobs]);

  useEffect(() => {
    const hasRunningJobs = jobs.some((job) => job.status === "Running");
    if (!hasRunningJobs) return;

    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [jobs]);

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const term = search.toLowerCase();
    return jobs.filter(
      (job) =>
        job.id.toString().includes(term) ||
        job.flexibilityClass.toLowerCase().includes(term) ||
        job.status.toLowerCase().includes(term) ||
        (job.workloadClass ?? "").toLowerCase().includes(term),
    );
  }, [jobs, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = paginated.length > 0 && paginated.every((job) => selected.has(job.id));

  const handleSort = (key: SortableJobKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginated.forEach((job) => next.delete(job.id));
      } else {
        paginated.forEach((job) => next.add(job.id));
      }
      return next;
    });
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);

    try {
      const response = await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      if (!response.ok) {
        return;
      }

      setJobs((prev) => prev.filter((job) => !selected.has(job.id)));
      setSelected(new Set());
      setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil((sorted.length - ids.length) / pageSize))));
    } catch (error) {
      console.error("Failed to delete selected jobs.", error);
    }
  };

  const deleteJob = async (id: number) => {
    try {
      const response = await fetch("/api/jobs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });

      if (!response.ok) {
        return;
      }

      setJobs((prev) => prev.filter((job) => job.id !== id));
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setCurrentPage((prev) => Math.min(prev, Math.max(1, Math.ceil((sorted.length - 1) / pageSize))));
    } catch (error) {
      console.error(`Failed to delete job ${id}.`, error);
    }
  };

  const indicator = (key: SortableJobKey) =>
    sortKey !== key ? "<>" : sortDir === "asc" ? "^" : "v";

  const statusColor = (status: string) => {
    if (status === "Completed") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    if (status === "Running") return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
  };

  const columns: { key: SortableJobKey; label: string }[] = [
    { key: "id", label: "Job ID" },
    { key: "jobName", label: "Job Name" },
    { key: "archiveName", label: "Zip File" },
    { key: "submitHour", label: "Submit Hour" },
    { key: "requestedCpus", label: "CPUs" },
    { key: "runtimeHours", label: "Runtime" },
    { key: "flexibilityClass", label: "Flexibility" },
    { key: "status", label: "Status" },
    { key: "carbonBaseline", label: "Baseline CO2" },
    { key: "carbonOptimized", label: "Optimized CO2" },
  ];

  const runningCount = jobs.filter((j) => j.status === "Running").length;
  const queuedCount = jobs.filter((j) => j.status === "Queued").length;

  return (
    <div className="max-w-[95rem] mx-auto px-6 py-10 space-y-4">
      <h1 className="text-3xl font-bold">Job History</h1>

      {/* Live cluster status bar */}
      <div className="flex gap-4 text-sm">
        <span className="px-2 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300 font-medium">
          {runningCount} / 3 running
        </span>
        {queuedCount > 0 && (
          <span className="px-2 py-1 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300 font-medium">
            {queuedCount} in queue
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          placeholder="Search by ID, name, flexibility, or status..."
          className="w-full sm:w-72 px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive text-destructive-foreground rounded text-sm hover:opacity-90"
            >
              <Trash2 className="size-3.5" /> Delete {selected.size} selected
            </button>
          )}
          <p className="text-sm text-muted-foreground">{paginated.length} of {filtered.length} jobs</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-[88rem] divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="rounded" />
              </th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                >
                  {col.label} <span className="text-xs">{indicator(col.key)}</span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Progress
              </th>
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((job) => (
              <tr key={job.id} className={"hover:bg-muted/50 transition-colors " + (selected.has(job.id) ? "bg-muted/30" : "")}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggleSelect(job.id)} className="rounded" />
                </td>
                <td className="px-4 py-3 text-sm font-medium">{job.id}</td>
                <td className="px-4 py-3 text-sm">{job.jobName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{job.archiveName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">Hour {job.submitHour}</td>
                <td className="px-4 py-3 text-sm">{job.requestedCpus}</td>
                <td className="px-4 py-3 text-sm">{job.runtimeHours}h</td>
                <td className="px-4 py-3 text-sm">
                  <Badge variant={job.flexibilityClass === "rigid" ? "destructive" : job.flexibilityClass === "semi-flexible" ? "secondary" : "default"}>
                    {job.flexibilityClass}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(job.status)}`}>
                    {job.status}
                    {job.status === "Queued" && job.queuePosition != null && (
                      <span className="ml-1 opacity-70">#{job.queuePosition}</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{job.carbonBaseline}g</td>
                <td className="px-4 py-3 text-sm text-primary font-medium">{job.carbonOptimized}g</td>
                <td className="px-4 py-3">
                  <ProgressCell job={job} nowMs={nowMs} />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => deleteJob(job.id)}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center items-center gap-2">
        <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">Prev</button>
        {Array.from({ length: totalPages }, (_, i) => (
          <button key={i + 1} onClick={() => setCurrentPage(i + 1)}
            className={"px-3 py-1 rounded text-sm " + (currentPage === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted border border-border text-muted-foreground")}>
            {i + 1}
          </button>
        ))}
        <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50">Next</button>
      </div>
    </div>
  );
}
