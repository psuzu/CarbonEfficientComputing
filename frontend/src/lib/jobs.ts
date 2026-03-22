export type FlexibilityClass = "rigid" | "semi-flexible" | "flexible";

export type ComplexityClass = "HIGH" | "LOW";

export type JobStatus = "Completed" | "Running" | "Scheduled" | "Queued";

export type JobRecord = {
  id: number;
  submitHour: number;
  requestedCpus: number;
  runtimeHours: number;
  flexibilityClass: FlexibilityClass;
  complexityClass?: ComplexityClass;
  complexity?: string;
  status: JobStatus;
  carbonBaseline: number;
  carbonOptimized: number;
  scheduledStart: number;
  delayHours?: number;
  submitterName?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  queuePosition?: number | null;
  createdAt?: string | null;
  simulationStartTime?: string | null;
  simulationEndTime?: string | null;
  simulationDurationSeconds?: number | null;
};
