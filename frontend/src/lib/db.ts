import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "..", "data", "jobs.db");

// Ensure data dir exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    submitHour INTEGER,
    requestedCpus INTEGER,
    runtimeHours INTEGER,
    flexibilityClass TEXT,
    status TEXT,
    carbonBaseline REAL,
    carbonOptimized REAL,
    scheduledStart INTEGER,
    delayHours INTEGER,
    createdAt TEXT DEFAULT (datetime('now'))
  )
`);

// Seed mock jobs if table is empty
const count = (db.prepare("SELECT COUNT(*) as c FROM jobs").get() as { c: number }).c;
if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO jobs (submitHour, requestedCpus, runtimeHours, flexibilityClass, status, carbonBaseline, carbonOptimized, scheduledStart, delayHours)
    VALUES (@submitHour, @requestedCpus, @runtimeHours, @flexibilityClass, @status, @carbonBaseline, @carbonOptimized, @scheduledStart, @delayHours)
  `);
  const seed = db.transaction((rows: object[]) => rows.forEach((r) => insert.run(r)));
  seed([
    { submitHour: 1,  requestedCpus: 126, runtimeHours: 12, flexibilityClass: "semi-flexible", status: "Completed", carbonBaseline: 340.2,   carbonOptimized: 245.8,  scheduledStart: 4,  delayHours: 3 },
    { submitHour: 6,  requestedCpus: 1,   runtimeHours: 3,  flexibilityClass: "rigid",         status: "Completed", carbonBaseline: 12.5,    carbonOptimized: 12.5,   scheduledStart: 6,  delayHours: 0 },
    { submitHour: 13, requestedCpus: 2,   runtimeHours: 3,  flexibilityClass: "rigid",         status: "Completed", carbonBaseline: 18.3,    carbonOptimized: 18.3,   scheduledStart: 13, delayHours: 0 },
    { submitHour: 45, requestedCpus: 115, runtimeHours: 21, flexibilityClass: "flexible",      status: "Running",   carbonBaseline: 890.4,   carbonOptimized: 612.1,  scheduledStart: 3,  delayHours: 0 },
    { submitHour: 17, requestedCpus: 29,  runtimeHours: 1,  flexibilityClass: "flexible",      status: "Completed", carbonBaseline: 22.1,    carbonOptimized: 14.7,   scheduledStart: 22, delayHours: 5 },
    { submitHour: 27, requestedCpus: 3,   runtimeHours: 2,  flexibilityClass: "rigid",         status: "Completed", carbonBaseline: 9.8,     carbonOptimized: 9.8,    scheduledStart: 27, delayHours: 0 },
    { submitHour: 21, requestedCpus: 90,  runtimeHours: 17, flexibilityClass: "flexible",      status: "Completed", carbonBaseline: 620.5,   carbonOptimized: 430.2,  scheduledStart: 26, delayHours: 5 },
    { submitHour: 22, requestedCpus: 23,  runtimeHours: 3,  flexibilityClass: "flexible",      status: "Completed", carbonBaseline: 45.6,    carbonOptimized: 31.2,   scheduledStart: 28, delayHours: 6 },
    { submitHour: 34, requestedCpus: 47,  runtimeHours: 16, flexibilityClass: "semi-flexible", status: "Running",   carbonBaseline: 380.2,   carbonOptimized: 290.5,  scheduledStart: 38, delayHours: 4 },
    { submitHour: 40, requestedCpus: 23,  runtimeHours: 3,  flexibilityClass: "semi-flexible", status: "Queued",    carbonBaseline: 32.1,    carbonOptimized: 24.8,   scheduledStart: 44, delayHours: 4 },
    { submitHour: 2,  requestedCpus: 116, runtimeHours: 11, flexibilityClass: "flexible",      status: "Completed", carbonBaseline: 510.3,   carbonOptimized: 355.9,  scheduledStart: 8,  delayHours: 6 },
    { submitHour: 14, requestedCpus: 89,  runtimeHours: 36, flexibilityClass: "flexible",      status: "Completed", carbonBaseline: 1280.4,  carbonOptimized: 880.6,  scheduledStart: 20, delayHours: 6 },
  ]);
}

export default db;
