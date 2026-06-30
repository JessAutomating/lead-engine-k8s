// End-to-end dry-run test. Runs the whole pipeline against fixtures with zero
// network and zero secrets, and asserts every branch is exercised.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, secretValues } from "../src/config.js";
import { createLogger } from "../src/logger.js";
import { runPipeline } from "../src/pipeline.js";

function buildCtx() {
  const { config, env, root } = loadConfig({ dryRun: true });
  const logger = createLogger(secretValues(env));
  return { config, env, root, dryRun: true, logger, dryStore: [] };
}

test("dry-run completes end to end against fixtures", async () => {
  const ctx = buildCtx();
  const summary = await runPipeline(ctx);

  // 4 fixture businesses x 3 configured segments.
  assert.equal(summary.total, 12, "should scan every fixture business per segment");

  // Branch coverage: both buckets get hits.
  assert.ok(summary.qualified > 0, "expected some qualified leads");
  assert.ok(summary.lowScore > 0, "expected some low-score leads");

  // One no-website business per segment.
  assert.equal(summary.noWebsite, 3, "expected the no-website lead flagged each segment");

  // Accounting holds.
  assert.equal(summary.qualified + summary.lowScore + summary.invalid, summary.total);

  // Writes match counts.
  assert.equal(summary.qualifiedWritten, summary.qualified);
  assert.equal(summary.lowWritten, summary.lowScore);

  // Two tabs were written to the in-memory store.
  const tabs = new Set(ctx.dryStore.map((w) => w.tab));
  assert.ok(tabs.has("Qualified"));
  assert.ok(tabs.has("LowScore"));
});

test("dry-run requires no credentials", async () => {
  // None of the credential env vars are set in this test process.
  const ctx = buildCtx();
  await assert.doesNotReject(() => runPipeline(ctx));
});
