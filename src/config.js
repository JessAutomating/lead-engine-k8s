// Loads configuration from a JSON file plus environment variables.
// Non-secret settings (segments, region, model, tabs, limits) live in the config
// file / ConfigMap. Secrets (API keys, OAuth token) live only in the environment
// / Kubernetes Secret and are never written to disk by this runner.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, isAbsolute } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// Load a .env file into process.env if present, without overriding values that
// are already set (Kubernetes-injected env always wins). Zero dependencies.
function loadDotEnv() {
  const envPath = resolve(root, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function resolveConfigPath(cliPath) {
  const candidates = [
    cliPath,
    process.env.CONFIG_PATH,
    resolve(root, "config.json"),
    resolve(root, "config.example.json"),
  ].filter(Boolean);
  for (const c of candidates) {
    const p = isAbsolute(c) ? c : resolve(root, c);
    if (existsSync(p)) return p;
  }
  throw new Error("No config file found. Pass --config <path> or create config.json");
}

export function loadConfig({ configPath, dryRun, regionOverride } = {}) {
  loadDotEnv();

  const path = resolveConfigPath(configPath);
  const config = JSON.parse(readFileSync(path, "utf8"));
  if (regionOverride) config.region = regionOverride;

  const env = {
    apifyToken: process.env.APIFY_TOKEN || "",
    firecrawlKey: process.env.FIRECRAWL_API_KEY || "",
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    googleToken: process.env.GOOGLE_ACCESS_TOKEN || "",
    sheetId: process.env.GOOGLE_SHEET_ID || "",
    notifyTo: process.env.NOTIFY_TO || "",
    notifyFrom: process.env.NOTIFY_FROM || "",
  };

  // In real mode every credential is required. In dry-run none are, because the
  // stages are mocked against fixtures.
  if (!dryRun) {
    const required = {
      APIFY_TOKEN: env.apifyToken,
      FIRECRAWL_API_KEY: env.firecrawlKey,
      ANTHROPIC_API_KEY: env.anthropicKey,
      GOOGLE_ACCESS_TOKEN: env.googleToken,
      GOOGLE_SHEET_ID: env.sheetId,
      NOTIFY_TO: env.notifyTo,
      NOTIFY_FROM: env.notifyFrom,
    };
    const missing = Object.entries(required)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length) {
      throw new Error(
        `Missing required env for real mode: ${missing.join(", ")}. ` +
          `Use --dry-run to test with fixtures, or set these via .env / Kubernetes Secret.`
      );
    }
  }

  return { configPath: path, config, env, root };
}

export function secretValues(env) {
  return [env.apifyToken, env.firecrawlKey, env.anthropicKey, env.googleToken].filter(Boolean);
}
