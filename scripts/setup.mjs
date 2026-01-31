import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(scriptDir, "..");

const envPath = path.join(packageDir, ".env");
const envExamplePath = path.join(packageDir, ".env.example");

const install = spawnSync("pnpm", ["install"], { cwd: packageDir, stdio: "inherit" });
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const build = spawnSync("pnpm", ["build"], { cwd: packageDir, stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  copyFileSync(envExamplePath, envPath);
  console.log("Created .env from .env.example");
}
