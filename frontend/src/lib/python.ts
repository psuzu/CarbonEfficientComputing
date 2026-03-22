import path from "node:path";
import { spawn } from "node:child_process";

const PYTHON_CANDIDATES = process.env.PYTHON_BIN
  ? [process.env.PYTHON_BIN, "python3", "python"]
  : process.platform === "win32"
    ? ["python", "python3"]
    : ["python3", "python"];

function spawnPython(
  repoRoot: string,
  args: string[],
  payload?: string,
  extraEnv?: Partial<NodeJS.ProcessEnv>,
): Promise<string> {
  const candidates = [...new Set(PYTHON_CANDIDATES.filter(Boolean))];

  const attempt = (index: number): Promise<string> => {
    const command = candidates[index];

    if (!command) {
      return Promise.reject(
        new Error(
          "Python runtime not found. Set PYTHON_BIN to a valid interpreter path in the deployment environment.",
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: repoRoot,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ...extraEnv,
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
      child.on("error", (error) => {
        if ("code" in error && error.code === "ENOENT") {
          void attempt(index + 1).then(resolve, reject);
          return;
        }
        reject(error);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        reject(new Error(stderr.trim() || `${args[0]} exited with code ${code}`));
      });

      if (payload !== undefined) {
        child.stdin.write(payload);
      }
      child.stdin.end();
    });
  };

  return attempt(0);
}

export function runPythonScript(
  repoRoot: string,
  scriptName: string,
  payload: string,
): Promise<string> {
  return spawnPython(repoRoot, [path.join(repoRoot, scriptName)], payload);
}

export function runPythonModule(
  repoRoot: string,
  moduleName: string,
  args: string[] = [],
  extraEnv?: Partial<NodeJS.ProcessEnv>,
): Promise<string> {
  return spawnPython(repoRoot, ["-m", moduleName, ...args], undefined, extraEnv);
}
