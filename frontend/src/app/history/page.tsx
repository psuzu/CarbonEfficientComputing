"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StoredJob } from "@/lib/job-store";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<StoredJob[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof StoredJob>("submittedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      const response = await fetch("/api/jobs", { cache: "no-store" });
      const payload = (await response.json()) as StoredJob[] | { jobs?: StoredJob[] };
      const nextJobs = Array.isArray(payload) ? payload : payload.jobs;
      if (!cancelled && Array.isArray(nextJobs)) {
        setJobs(nextJobs);
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

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const term = search.toLowerCase();
    return jobs.filter(
      (job) =>
        job.id.toString().includes(term) ||
        job.flexibilityClass.toLowerCase().includes(term) ||
        job.status.toLowerCase().includes(term) ||
        job.workloadClass.toLowerCase().includes(term),
    );
  }, [jobs, search]);

  const sorted = useMemo(() => {
    const safeArray = Array.isArray(filtered) ? filtered : [];

    return [...safeArray].sort((left, right) => {
      const leftValue = left[sortKey];
      const rightValue = right[sortKey];

      if (sortKey === "submittedAt") {
        const leftTime = new Date(String(leftValue)).getTime();
        const rightTime = new Date(String(rightValue)).getTime();

        if (leftTime < rightTime) return sortDir === "asc" ? -1 : 1;
        if (leftTime > rightTime) return sortDir === "asc" ? 1 : -1;
        return left.id - right.id;
      }

      if (leftValue === rightValue) return left.id - right.id;

      if (leftValue === null || leftValue === undefined) return 1;
      if (rightValue === null || rightValue === undefined) return -1;

      if (leftValue < rightValue) return sortDir === "asc" ? -1 : 1;
      if (leftValue > rightValue) return sortDir === "asc" ? 1 : -1;
      return left.id - right.id;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const allPageSelected = paginated.length > 0 && paginated.every((job) => selected.has(job.id));

  const handleSort = (key: keyof StoredJob) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const toggleSelect = (jobId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
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

  const indicator = (key: keyof StoredJob) =>
    sortKey !== key ? "<>" : sortDir === "asc" ? "^" : "v";

  const statusColor = (status: string) => {
    if (status === "Completed") return "bg-green-100 text-green-800";
    if (status === "Running") return "bg-blue-100 text-blue-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const columns: { key: keyof StoredJob; label: string }[] = [
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

  return (
    <div className="max-w-[95rem] mx-auto px-6 py-10 space-y-4">
      <h1 className="text-3xl font-bold">Job History</h1>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by ID, workload, flexibility, or status..."
          className="w-full sm:w-80 px-3 py-2 border rounded-md bg-background border-input focus:outline-none focus:ring-2 focus:ring-ring"
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
                  <Badge
                    variant={
                      job.flexibilityClass === "rigid"
                        ? "destructive"
                        : job.flexibilityClass === "semi-flexible"
                          ? "secondary"
                          : "default"
                    }
                  >
                    {job.flexibilityClass}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(job.status)}`}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {job.carbonBaseline.toFixed(0)}g
                </td>
                <td className="px-4 py-3 text-sm text-primary font-medium">
                  {job.carbonOptimized.toFixed(0)}g
                </td>
                <td className="px-4 py-3 text-sm min-w-48">
                  <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${
                        job.status === "Completed"
                          ? "bg-green-500"
                          : job.status === "Running"
                            ? "bg-blue-500"
                            : "bg-yellow-500"
                      }`}
                      style={{ width: `${job.progressPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {job.status === "Completed"
                      ? "Finished"
                      : job.status === "Queued" && job.queueAheadCount > 0
                        ? `${job.queueAheadCount} job(s) ahead`
                        : `${job.progressPercent}% complete`}
                  </p>
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
