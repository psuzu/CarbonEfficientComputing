import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type FlexibilityClass = "rigid" | "semi-flexible" | "flexible";
export type JobStatus = "Queued" | "Running" | "Completed";

export type StoredJob = {
  id: number;
  jobName: string;
  archiveName: string;
  submitHour: number;
  submittedAt: string;
  submittedCpus: number;
  submittedRuntimeHours: number;
  requestedCpus: number;
  runtimeHours: number;
  flexibilityClass: FlexibilityClass;
  workloadClass: string;
  intensityLabel: string;
  status: JobStatus;
  progressPercent: number;
  carbonBaseline: number;
  carbonOptimized: number;
  carbonSaved: number;
  scheduledStart: number;
  latestStartHour: number;
  delayHours: number;
  queueAheadCount: number;
};

type PersistedJob = Omit<StoredJob, "status" | "progressPercent" | "queueAheadCount">;

type JobDb = {
  nextId: number;
  jobs: PersistedJob[];
};

const DB_PATH = path.resolve(process.cwd(), "..", "data", "job_queue_db.json");
const DEMO_SECONDS_PER_HOUR = 20;

async function ensureDb(): Promise<void> {
  await mkdir(path.dirname(DB_PATH), { recursive: true });
  try {
    await readFile(DB_PATH, "utf-8");
  } catch {
    await writeFile(DB_PATH, JSON.stringify({ nextId: 1, jobs: [] }, null, 2), "utf-8");
  }
}

async function readDb(): Promise<JobDb> {
  await ensureDb();
  return JSON.parse(await readFile(DB_PATH, "utf-8")) as JobDb;
}

async function writeDb(db: JobDb): Promise<void> {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function deriveJob(job: PersistedJob, now = Date.now()): StoredJob {
  const submittedAtMs = new Date(job.submittedAt).getTime();
  const startAtMs = submittedAtMs + job.delayHours * DEMO_SECONDS_PER_HOUR * 1000;
  const completeAtMs = startAtMs + job.runtimeHours * DEMO_SECONDS_PER_HOUR * 1000;

  let status: JobStatus = "Queued";
  if (now >= completeAtMs) {
    status = "Completed";
  } else if (now >= startAtMs) {
    status = "Running";
  }

  const totalDuration = Math.max(1, completeAtMs - submittedAtMs);
  const progressPercent = Math.max(
    0,
    Math.min(100, Math.round(((now - submittedAtMs) / totalDuration) * 100)),
  );

  return {
    ...job,
    status,
    progressPercent: status === "Completed" ? 100 : progressPercent,
    queueAheadCount: 0,
  };
}

export async function listJobs(): Promise<StoredJob[]> {
  const db = await readDb();
  const derivedJobs = db.jobs
    .map((job) => deriveJob(job))
    .sort((left, right) => {
      if (left.status === "Completed" && right.status !== "Completed") return 1;
      if (left.status !== "Completed" && right.status === "Completed") return -1;
      if (left.scheduledStart !== right.scheduledStart) return left.scheduledStart - right.scheduledStart;
      return left.id - right.id;
    });

  let activeBefore = 0;
  const withQueueCounts = derivedJobs.map((job) => {
    if (job.status === "Queued") {
      const derived = { ...job, queueAheadCount: activeBefore };
      activeBefore += 1;
      return derived;
    }
    if (job.status === "Running") {
      activeBefore += 1;
      return { ...job, queueAheadCount: 0 };
    }
    return { ...job, queueAheadCount: 0 };
  });

  return withQueueCounts.sort((left, right) => right.id - left.id);
}

export async function createJob(
  job: Omit<PersistedJob, "id" | "submittedAt" | "submitHour"> & { submitHour?: number },
): Promise<StoredJob> {
  const db = await readDb();
  const storedJob = {
    ...job,
    id: db.nextId,
    submitHour: job.submitHour ?? 0,
    submittedAt: new Date().toISOString(),
  };
  db.nextId += 1;
  db.jobs.push(storedJob);
  await writeDb(db);
  return deriveJob(storedJob);
}
