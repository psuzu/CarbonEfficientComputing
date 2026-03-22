"use client";

import { useEffect } from "react";

// Fires /api/jobs/tick every 10s globally, regardless of which page is open.
export function JobTicker() {
  useEffect(() => {
    const run = () => fetch("/api/jobs/tick", { method: "POST" }).catch(() => {});
    run(); // fire immediately on mount
    const id = setInterval(run, 10_000);
    return () => clearInterval(id);
  }, []);

  return null;
}
