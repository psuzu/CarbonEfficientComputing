// Cluster state values from cluster_state.py default_cluster()
export const clusterState = {
  totalNodes: 40,
  nodesInUse: 24,
  totalProcessors: 1280,
  processorsInUse: 672,
  totalGpus: 32,
  gpusInUse: 18,
  jobsRunning: 47,
  jobsQueued: 12,
};

export type FlexibilityClass = "rigid" | "semi-flexible" | "flexible";

export type JobRecord = {
  id: number;
  submitHour: number;
  requestedCpus: number;
  runtimeHours: number;
  flexibilityClass: FlexibilityClass;
  status: "Completed" | "Running" | "Queued";
  carbonBaseline: number;
  carbonOptimized: number;
  scheduledStart: number;
};

// Mock jobs matching generate_workload.py structure
export const mockJobs: JobRecord[] = [
  { id: 1, submitHour: 1, requestedCpus: 126, runtimeHours: 12, flexibilityClass: "semi-flexible", status: "Completed", carbonBaseline: 340.2, carbonOptimized: 245.8, scheduledStart: 4 },
  { id: 2, submitHour: 6, requestedCpus: 1, runtimeHours: 3, flexibilityClass: "rigid", status: "Completed", carbonBaseline: 12.5, carbonOptimized: 12.5, scheduledStart: 6 },
  { id: 3, submitHour: 13, requestedCpus: 2, runtimeHours: 3, flexibilityClass: "rigid", status: "Completed", carbonBaseline: 18.3, carbonOptimized: 18.3, scheduledStart: 13 },
  { id: 4, submitHour: 45, requestedCpus: 115, runtimeHours: 21, flexibilityClass: "flexible", status: "Running", carbonBaseline: 890.4, carbonOptimized: 612.1, scheduledStart: 3 },
  { id: 5, submitHour: 17, requestedCpus: 29, runtimeHours: 1, flexibilityClass: "flexible", status: "Completed", carbonBaseline: 22.1, carbonOptimized: 14.7, scheduledStart: 22 },
  { id: 6, submitHour: 27, requestedCpus: 3, runtimeHours: 2, flexibilityClass: "rigid", status: "Completed", carbonBaseline: 9.8, carbonOptimized: 9.8, scheduledStart: 27 },
  { id: 7, submitHour: 21, requestedCpus: 90, runtimeHours: 17, flexibilityClass: "flexible", status: "Completed", carbonBaseline: 620.5, carbonOptimized: 430.2, scheduledStart: 26 },
  { id: 8, submitHour: 22, requestedCpus: 23, runtimeHours: 3, flexibilityClass: "flexible", status: "Completed", carbonBaseline: 45.6, carbonOptimized: 31.2, scheduledStart: 28 },
  { id: 9, submitHour: 34, requestedCpus: 47, runtimeHours: 16, flexibilityClass: "semi-flexible", status: "Running", carbonBaseline: 380.2, carbonOptimized: 290.5, scheduledStart: 38 },
  { id: 10, submitHour: 40, requestedCpus: 23, runtimeHours: 3, flexibilityClass: "semi-flexible", status: "Queued", carbonBaseline: 32.1, carbonOptimized: 24.8, scheduledStart: 44 },
  { id: 11, submitHour: 2, requestedCpus: 116, runtimeHours: 11, flexibilityClass: "flexible", status: "Completed", carbonBaseline: 510.3, carbonOptimized: 355.9, scheduledStart: 8 },
  { id: 12, submitHour: 14, requestedCpus: 89, runtimeHours: 36, flexibilityClass: "flexible", status: "Completed", carbonBaseline: 1280.4, carbonOptimized: 880.6, scheduledStart: 20 },
];

// 48-hour carbon intensity forecast (gCO2/kWh)
export const carbonForecast = Array.from({ length: 48 }, (_, i) => ({
  hour: i,
  intensity: Math.round(200 + 150 * Math.sin((i - 6) * Math.PI / 12) + (Math.random() - 0.5) * 40),
}));

// Cluster utilization over 24 hours for analytics charts
export const clusterUtilization = Array.from({ length: 24 }, (_, i) => ({
  hour: i,
  cpuPercent: Math.round(40 + 30 * Math.sin((i - 8) * Math.PI / 12) + (Math.random() - 0.5) * 10),
  gpuPercent: Math.round(35 + 35 * Math.sin((i - 10) * Math.PI / 12) + (Math.random() - 0.5) * 15),
}));
