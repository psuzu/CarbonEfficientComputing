import path from "node:path";
import { spawn } from "node:child_process";

const PYTHON_COMMAND = process.platform === "win32" ? "python" : "python3";

export function runPythonScript(
  repoRoot: string,
  scriptName: string,
  payload: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_COMMAND, [path.join(repoRoot, scriptName)], {
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr.trim() || `${scriptName} exited with code ${code}`));
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
