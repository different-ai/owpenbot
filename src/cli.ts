import { Command } from "commander";
import { createInterface } from "node:readline/promises";

import { startBridge } from "./bridge.js";
import { loadConfig } from "./config.js";
import { BridgeStore } from "./db.js";
import { createLogger } from "./logger.js";
import { resolvePairingCode } from "./pairing.js";
import { loginWhatsApp, unpairWhatsApp } from "./whatsapp.js";

const program = new Command();

const LOGO = `▓▓▓▓▓▓▒
░▓▓▓▓    ░▓▓▓▓
▓▓▓▓▓           ▓▓▓▓
▓▓▓▓▒                 ▓▓▓▓▒
▓▓▓▓                     ▓▓▓▓▓▓▓░
▒▓▓▓▓                    ░▓▓▓▓     ▓▓▓
▓▓▓▓▒                    ▓▓▓▓▓          ▓▓
▓▓▓▓                     ▓▓▓▓▒             ▓▓
▓▓▓▓                     ▓▓▓▓                 ▓▓

▒▓▓▓                ▓▓▓▓              ▓▓▓▓▓        ▓▓
▓▓               ▓▓▓             ░▓▓▓▓  ▓▓        ▓▓
▒▓▓             ▓▓▓            ▓▓▓▓▓     ▓▓        ▓▓
▓▓             ▓▓▓          ▓▓▓▓         ▓▓        ▓▓
▓▓            ▓▓░         ▓▓▓            ▓▓        ▓▓
▓▓            ▓▓         ▓▓              ▓▓        ▓▓
▓▓           ▓▓▒        ▓▓           ▓▓▓▓▓▓        ▓▓
▓▓           ▓▓░        ▓▓        ▓▓▓▓▒  ▓   ▓▓
▓▓           ▓▓░        ▓▓▓▓▒            ▓▓        ▓▓
▓▓           ▓▓░        ▓▓              ░▓▓        ▓▓
▓▓           ▓▓░        ▓▓              ▓▓         ▓▓
▓▓           ▓▓░        ▓▓            ▓▓▓         ▓▓
▓▓           ▓▓░        ▓▓         ▓▓▓▓          ▓▓
▓▓           ▓▓░        ▓▓     ░▓▓▓▓            ▓▓▒
▓▓           ▓▓░        ▓▓  ▓▓▓▓▓             ▓▓▓
▓▓           ▓▓░        ▓▓▓▓▓▒      ▓▓
▓▓▓         ▓▓░                  ▓▓▓▓▓
▓▓▓▓      ▓▓░               ▓▓▓▓░
▓▓▓▓░  ▒▓░           ░▓▓▓▓
▓▓▓▓▓▓▓        ▓▓▓▓▓
░▓▓▓▓▓   ▓▓▓▓▒
▒▓▓▓▓▓▓`;

program
  .name("owpenbot")
  .description("OpenCode WhatsApp + Telegram bridge")
  .allowExcessArguments(true)
  .allowUnknownOption(true)
  .argument("[path]");

const runStart = async () => {
  console.log(LOGO);
  const config = loadConfig();
  const logger = createLogger(config.logLevel);
  if (!process.env.OPENCODE_DIRECTORY) {
    process.env.OPENCODE_DIRECTORY = config.opencodeDirectory;
  }
  const bridge = await startBridge(config, logger);
  logger.info("Commands: owpenbot qr, owpenbot unpair, owpenbot pairing-code");

  const shutdown = async () => {
    logger.info("shutting down");
    await bridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

program
  .command("start")
  .description("Start the bridge")
  .action(runStart);

program.action(async () => {
  if (process.argv.length > 2) {
    await runStart();
    return;
  }

  console.log(LOGO);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "Choose: (1) Start bridge (2) Show QR (3) Unpair (4) Pairing code > ",
  );
  rl.close();

  const choice = answer.trim();
  if (choice === "2") {
    const config = loadConfig(process.env, { requireOpencode: false });
    const logger = createLogger(config.logLevel);
    await loginWhatsApp(config, logger);
    return;
  }
  if (choice === "3") {
    const config = loadConfig(process.env, { requireOpencode: false });
    const logger = createLogger(config.logLevel);
    unpairWhatsApp(config, logger);
    return;
  }
  if (choice === "4") {
    const config = loadConfig(process.env, { requireOpencode: false });
    const store = new BridgeStore(config.dbPath);
    const code = resolvePairingCode(store, config.pairingCode);
    console.log(code);
    store.close();
    return;
  }

  await runStart();
});

program
  .command("pairing-code")
  .description("Print the current pairing code")
  .action(() => {
    const config = loadConfig(process.env, { requireOpencode: false });
    const store = new BridgeStore(config.dbPath);
    const code = resolvePairingCode(store, config.pairingCode);
    console.log(code);
    store.close();
  });

const whatsapp = program.command("whatsapp").description("WhatsApp helpers");

whatsapp
  .command("login")
  .description("Login to WhatsApp via QR code")
  .action(async () => {
    const config = loadConfig(process.env, { requireOpencode: false });
    const logger = createLogger(config.logLevel);
    await loginWhatsApp(config, logger);
  });

program
  .command("qr")
  .description("Print a WhatsApp QR code to pair")
  .action(async () => {
    const config = loadConfig(process.env, { requireOpencode: false });
    const logger = createLogger(config.logLevel);
    await loginWhatsApp(config, logger);
  });

program
  .command("unpair")
  .description("Clear WhatsApp pairing data")
  .action(() => {
    const config = loadConfig(process.env, { requireOpencode: false });
    const logger = createLogger(config.logLevel);
    unpairWhatsApp(config, logger);
  });

await program.parseAsync(process.argv);
