"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { mockJobs, type JobRecord } from "@/lib/mock-data";

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<keyof JobRecord>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const filtered = useMemo(() => {
    if (!search) return mockJobs;
    const term = search.toLowerCase();
    return mockJobs.filter(
      (job) =>
        job.id.toString().includes(term) ||
        job.flexibilityClass.toLowerCase().includes(term) ||
        job.status.toLowerCase().includes(term)
    );
  }, [search]);

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
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
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
        <p className="text-sm text-muted-foreground">
          {paginated.length} of {filtered.length} jobs
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-muted">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column.key)}
                  className="px-4 py-3 text-left text-sm font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground"
                >
                  {column.label} <span className="text-xs">{indicator(column.key)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.map((job) => (
              <tr key={job.id} className="hover:bg-muted/50 transition-colors">
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
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(job.status)}`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{job.carbonBaseline}g</td>
                <td className="px-4 py-3 text-sm text-primary font-medium">
                  {job.carbonOptimized}g
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center items-center gap-2">
        <button
          onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
        >
          Prev
        </button>
        {Array.from({ length: totalPages }, (_, index) => (
          <button
            key={index + 1}
            onClick={() => setCurrentPage(index + 1)}
            className={`px-3 py-1 rounded text-sm ${
              currentPage === index + 1
                ? "bg-primary text-primary-foreground"
                : "bg-muted border border-border text-muted-foreground"
            }`}
          >
            {index + 1}
          </button>
        ))}
        <button
          onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
