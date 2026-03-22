import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

const REPO_ROOT = path.resolve(process.cwd(), "..");

function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "python",
      ["-m", "decision.scheduler_api", ...args],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, PYTHONPATH: REPO_ROOT },
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
      } else {
        resolve(stdout.trim());
      }
    });

    proc.on("error", reject);
  });
}

// GET /api/schedule  -> full batch simulation
export async function GET() {
  try {
    const raw = await runPython([]);
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/schedule  -> single job estimate
// Body: { cpus: number, runtime: number, flexibility: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cpus: number = Number(body.cpus);
    const runtime: number = Number(body.runtime);
    const flexibility: string = String(body.flexibility);

    if (!cpus || !runtime || !flexibility) {
      return NextResponse.json(
        { error: "Missing required fields: cpus, runtime, flexibility" },
        { status: 400 }
      );
    }

    const raw = await runPython([String(cpus), String(runtime), flexibility]);
    const data = JSON.parse(raw);

    if (data.error) {
      return NextResponse.json(data, { status: 422 });
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}