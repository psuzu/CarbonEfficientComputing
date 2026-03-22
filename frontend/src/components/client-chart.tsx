"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ClientChartProps = {
  children: ReactNode;
  className?: string;
};

export function ClientChart({ children, className }: ClientChartProps) {
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (!mounted) {
    return <div className={cn("rounded-md bg-muted/40", className)} aria-hidden="true" />;
  }

  return <div className={className}>{children}</div>;
}
