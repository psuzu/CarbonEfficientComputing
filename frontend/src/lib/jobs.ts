export type FlexibilityClass = "rigid" | "semi-flexible" | "flexible";

export type JobStatus = "Completed" | "Running" | "Queued";

export type JobRecord = {
  id: number;
  submitHour: number;
  requestedCpus: number;
  runtimeHours: number;
  flexibilityClass: FlexibilityClass;
  status: JobStatus;
  carbonBaseline: number;
  carbonOptimized: number;
  scheduledStart: number;
  delayHours?: number;
  submitterName?: string;
  createdAt?: string | null;
};
