"use client";

import { useState, useMemo, useEffect } from "react";
import { type JobRecord } from "@/lib/mock-data";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof JobRecord>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const pageSize = 10;

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return jobs;
    const term = search.toLowerCase();
    return jobs.filter(
      (j) =>
        j.id.toString().includes(term) ||
        j.flexibilityClass.toLowerCase().includes(term) ||
        j.status.toLowerCase().includes(term)
    );
  }, [search, jobs]);

  const sorted = useMemo(() => {
    return [...filtered].sort((left, right) => {
      if (left[sortKey] < right[sortKey]) return sortDir === "asc" ? -1 : 1;
      if (left[sortKey] > right[sortKey]) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSort = (key: keyof JobRecord) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const deleteJob = async (id: number) => {
    await fetch("/api/jobs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) });
    setJobs((prev) => prev.filter((j) => j.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const deleteSelected = async () => {
    const ids = Array.from(selected);
    await fetch("/api/jobs", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
    setJobs((prev) => prev.filter((j) => !selected.has(j.id)));
    setSelected(new Set());
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const allPageSelected = paginated.length > 0 && paginated.every((j) => selected.has(j.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((j) => s.delete(j.id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((j) => s.add(j.id)); return s; });
    }
  };

  const indicator = (key: keyof JobRecord) =>
    sortKey !== key ? "<>" : sortDir === "asc" ? "^" : "v";

  const statusColor = (status: string) => {
    if (status === "Completed") {
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    }
    if (status === "Running") {
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300";
    }
    return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
  };

  const columns: { key: keyof JobRecord; label: string }[] = [
    { key: "id", label: "Job ID" },
    { key: "submitHour", label: "Submit Hour" },
    { key: "requestedCpus", label: "CPUs" },
    { key: "runtimeHours", label: "Runtime" },
    { key: "flexibilityClass", label: "Flexibility" },
    { key: "status", label: "Status" },
    { key: "carbonBaseline", label: "Baseline CO2" },
    { key: "carbonOptimized", label: "Optimized CO2" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-4">
      <h1 className="text-3xl font-bold">Job History</h1>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <input
          type="text"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search by ID, flexibility, or status..."
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
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3">
                <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAll} className="rounded" />
              </th>
              {columns.map((col) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                >
                  {column.label} <span className="text-xs">{indicator(column.key)}</span>
                </th>
              ))}
              <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((job) => (
              <tr key={job.id} className={"hover:bg-muted/50 transition-colors " + (selected.has(job.id) ? "bg-muted/30" : "")}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(job.id)} onChange={() => toggleSelect(job.id)} className="rounded" />
                </td>
                <td className="px-4 py-3 text-sm font-medium">{job.id}</td>
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
                  <span className={"px-2 py-1 rounded-full text-xs font-semibold " + statusColor(job.status)}>
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{job.carbonBaseline}g</td>
                <td className="px-4 py-3 text-sm text-primary font-medium">{job.carbonOptimized}g</td>
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
