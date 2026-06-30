#!/usr/bin/env node
// Entry point. Parses flags, loads config, runs the pipeline once, prints a JSON
// summary, and exits non-zero on failure (so a Kubernetes Job is marked failed).

import { loadConfig, secretValues } from "./config.js";
import { createLogger } from "./logger.js";
import { runPipeline } from "./pipeline.js";

function parseArgs(argv) {
  const args = { dryRun: false, configPath: null, region: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--config") args.configPath = argv[++i];
    else if (a.startsWith("--config=")) args.configPath = a.slice("--config=".length);
    else if (a === "--region") args.region = argv[++i];
    else if (a.startsWith("--region=")) args.region = a.slice("--region=".length);
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

const HELP = `lead-engine - weekly lead-generation batch runner

Usage:
  node src/index.js [options]

Options:
  --dry-run            Run end-to-end against local fixtures. No network, no secrets.
  --config <path>      Path to a config JSON (default: config.json or config.example.json).
  --region <name>      Override the region label from config.
  -h, --help           Show this help.

Environment (real mode only; see .env.example):
  APIFY_TOKEN, FIRECRAWL_API_KEY, ANTHROPIC_API_KEY, GOOGLE_ACCESS_TOKEN,
  GOOGLE_SHEET_ID, NOTIFY_TO, NOTIFY_FROM
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const { config, env, root } = loadConfig({
    configPath: args.configPath,
    dryRun: args.dryRun,
    regionOverride: args.region,
  });

  const logger = createLogger(secretValues(env));
  const ctx = { config, env, root, dryRun: args.dryRun, logger, dryStore: [] };

  const summary = await runPipeline(ctx);

  process.stdout.write("\n" + JSON.stringify({ result: "ok", summary: summarize(summary) }, null, 2) + "\n");
  return 0;
}

function summarize(s) {
  return {
    region: s.region,
    total: s.total,
    qualified: s.qualified,
    lowScore: s.lowScore,
    noWebsite: s.noWebsite,
    invalid: s.invalid,
    qualifiedWritten: s.qualifiedWritten,
    lowWritten: s.lowWritten,
    perSegment: s.perSegment,
  };
}

main()
  .then((code) => process.exit(code ?? 0))
  .catch((err) => {
    // One last redaction guard on the error path.
    process.stderr.write(JSON.stringify({ level: "error", msg: "run failed", error: String(err && err.message) }) + "\n");
    process.exit(1);
  });
