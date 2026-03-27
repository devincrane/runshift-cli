#!/usr/bin/env node

import { init } from "./commands/init.js";

const args = process.argv.slice(2);
const command = args[0] ?? "init";

switch (command) {
  case "init":
    init().catch((err) => {
      console.error(err.message ?? err);
      process.exit(1);
    });
    break;
  case "--version":
  case "-v":
    console.log("runshift 0.0.2");
    break;
  case "--help":
  case "-h":
    console.log(`
  runshift — the control plane for agents, wherever they run.

  Usage:
    npx runshift init    Read your repo, generate governance rules

  Options:
    --version, -v        Show version
    --help, -h           Show this help
`);
    break;
  default:
    console.error(`Unknown command: ${command}\nRun "runshift --help" for usage.`);
    process.exit(1);
}
