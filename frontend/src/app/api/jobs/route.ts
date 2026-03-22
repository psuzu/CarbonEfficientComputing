import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const jobs = db.prepare("SELECT * FROM jobs ORDER BY id DESC").all();
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const stmt = db.prepare(`
    INSERT INTO jobs (submitHour, requestedCpus, runtimeHours, flexibilityClass, status, carbonBaseline, carbonOptimized, scheduledStart, delayHours)
    VALUES (@submitHour, @requestedCpus, @runtimeHours, @flexibilityClass, @status, @carbonBaseline, @carbonOptimized, @scheduledStart, @delayHours)
  `);
  const result = stmt.run(body);
  const job = db.prepare("SELECT * FROM jobs WHERE id = ?").get(result.lastInsertRowid);
  return NextResponse.json(job, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { ids } = await req.json() as { ids: number[] };
  const del = db.prepare("DELETE FROM jobs WHERE id = ?");
  const deleteMany = db.transaction((idList: number[]) => idList.forEach((id) => del.run(id)));
  deleteMany(ids);
  return NextResponse.json({ deleted: ids });
}
