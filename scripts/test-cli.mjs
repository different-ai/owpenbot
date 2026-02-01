import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const cliPath = path.resolve("dist", "cli.js");

function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      if (options.expectTimeout) {
        resolve({ code: null, stdout, stderr, timedOut: true });
        return;
      }
      reject(new Error(`Timeout running ${cmd} ${args.join(" ")}`));
    }, options.timeoutMs ?? 5000);

    child.on("close", (code) => {
      if (timedOut) return;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, timedOut: false });
    });

    if (options.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

async function runHelp() {
  const result = await run("node", [cliPath, "--help"], { timeoutMs: 3000 });
  if (result.code !== 0) {
    throw new Error(`Help failed: ${result.stderr}`);
  }
  if (!result.stdout.includes("OpenCode WhatsApp")) {
    throw new Error("Help output missing expected header");
  }
}

async function runSetupNonInteractive() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "owpenbot-"));
  const env = {
    ...process.env,
    OWPENBOT_DATA_DIR: tempDir,
    OWPENBOT_DB_PATH: path.join(tempDir, "owpenbot.db"),
    OWPENBOT_CONFIG_PATH: path.join(tempDir, "owpenbot.json"),
    OPENCODE_DIRECTORY: tempDir,
  };
  const result = await run("node", [cliPath, "--non-interactive"], {
    env,
    timeoutMs: 5000,
  });
  if (result.code !== 0) {
    throw new Error(`Setup failed: ${result.stderr}`);
  }
  const cfg = await fs.readFile(path.join(tempDir, "owpenbot.json"), "utf-8");
  if (!cfg.includes("whatsapp")) {
    throw new Error("Config missing whatsapp section");
  }
}

async function runSetupInteractive() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "owpenbot-"));
  const env = {
    ...process.env,
    OWPENBOT_DATA_DIR: tempDir,
    OWPENBOT_DB_PATH: path.join(tempDir, "owpenbot.db"),
    OWPENBOT_CONFIG_PATH: path.join(tempDir, "owpenbot.json"),
    OPENCODE_DIRECTORY: tempDir,
    OWPENWORK_TEST_SELECTIONS: "config",
    OWPENWORK_TEST_SETUP: "personal",
    OWPENWORK_FORCE_TUI: "1",
  };
  const result = await run("node", ["--no-warnings", cliPath], {
    env,
    timeoutMs: 5000,
  });
  const output = `${result.stdout}${result.stderr}`;
  if (!output.includes("Owpenwork Setup")) {
    throw new Error("Interactive setup prompt not detected");
  }
  const cfg = await fs.readFile(path.join(tempDir, "owpenbot.json"), "utf-8");
  if (!cfg.includes("+15551234567")) {
    throw new Error("Interactive config missing allowlist number");
  }
}

async function runTelegramTokenFromEnv() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "owpenbot-"));
  const tokenEnv = process.env.OWPENBOT_TEST_TOKEN_ENV ?? "123456:env-test";
  const env = {
    ...process.env,
    OWPENBOT_DATA_DIR: tempDir,
    OWPENBOT_DB_PATH: path.join(tempDir, "owpenbot.db"),
    OWPENBOT_CONFIG_PATH: path.join(tempDir, "owpenbot.json"),
    OPENCODE_DIRECTORY: tempDir,
    OWPENWORK_TEST_TELEGRAM_TOKEN: tokenEnv,
  };

  const result = await run("node", [cliPath, "login", "telegram"], { env, timeoutMs: 5000 });
  if (result.code !== 0) {
    throw new Error(`Telegram login (env token) failed: ${result.stderr}`);
  }

  const cfgRaw = await fs.readFile(path.join(tempDir, "owpenbot.json"), "utf-8");
  const cfg = JSON.parse(cfgRaw);
  if (cfg?.channels?.telegram?.token !== tokenEnv) {
    throw new Error("Telegram token from env not persisted to config");
  }

  const status = await run("node", [cliPath, "telegram", "status", "--json"], { env, timeoutMs: 3000 });
  if (status.code !== 0) {
    throw new Error(`Telegram status failed: ${status.stderr}`);
  }
  const statusJson = JSON.parse(status.stdout || "{}");
  if (!statusJson.configured) {
    throw new Error("Telegram status did not report configured=true");
  }
}

async function runTelegramTokenFromCli() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "owpenbot-"));
  const tokenCli = process.env.OWPENBOT_TEST_TOKEN_CLI ?? "654321:cli-test";
  const env = {
    ...process.env,
    OWPENBOT_DATA_DIR: tempDir,
    OWPENBOT_DB_PATH: path.join(tempDir, "owpenbot.db"),
    OWPENBOT_CONFIG_PATH: path.join(tempDir, "owpenbot.json"),
    OPENCODE_DIRECTORY: tempDir,
  };

  const result = await run("node", [cliPath, "telegram", "set-token", tokenCli], { env, timeoutMs: 3000 });
  if (result.code !== 0) {
    throw new Error(`Telegram set-token failed: ${result.stderr}`);
  }

  const cfgRaw = await fs.readFile(path.join(tempDir, "owpenbot.json"), "utf-8");
  const cfg = JSON.parse(cfgRaw);
  if (cfg?.channels?.telegram?.token !== tokenCli) {
    throw new Error("Telegram token from CLI not persisted to config");
  }

  const status = await run("node", [cliPath, "status", "--json"], { env, timeoutMs: 3000 });
  if (status.code !== 0) {
    throw new Error(`Status --json failed: ${status.stderr}`);
  }
  const statusJson = JSON.parse(status.stdout || "{}");
  if (!statusJson?.telegram?.configured) {
    throw new Error("Status --json did not report telegram configured=true");
  }
}

await runHelp();
await runSetupNonInteractive();
await runSetupInteractive();
await runTelegramTokenFromEnv();
await runTelegramTokenFromCli();
console.log("CLI smoke tests passed");
