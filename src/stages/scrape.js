// Stage 1: scrape. Find candidate businesses for one market segment.
// Reference automation used a places search provider; the canonical credential
// type here is Apify. --dry-run reads fixtures and makes no network call.

import { readFileSync } from "node:fs";
import { requestJson } from "../http.js";

const FIXTURE = new URL("../../fixtures/apify.sample.json", import.meta.url);

export async function scrape({ segment, query, ctx }) {
  const { config } = ctx;
  const limit = config.limits?.max_results_per_segment ?? 20;
  const filter = (config.region_filter ?? []).map((s) => s.toLowerCase());

  let raw;
  if (ctx.dryRun) {
    raw = JSON.parse(readFileSync(FIXTURE, "utf8"));
    ctx.logger.stage("scrape", "loaded fixture businesses", { segment, count: raw.length });
  } else {
    raw = await scrapeApify({ query, limit, ctx });
    ctx.logger.stage("scrape", "scraped businesses", { segment, count: raw.length });
  }

  const businesses = raw.map(normalize).filter(Boolean);

  // Keep only in-region results, mirroring the reference region gate.
  const inRegion = filter.length
    ? businesses.filter((b) => filter.some((loc) => (b.address || "").toLowerCase().includes(loc)))
    : businesses;

  return inRegion.slice(0, limit).map((b) => ({ ...b, segment, region: config.region }));
}

async function scrapeApify({ query, limit, ctx }) {
  const actor = process.env.APIFY_ACTOR_ID || "compass~crawler-google-places";
  const url =
    `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(ctx.env.apifyToken)}`;
  const body = { searchStringsArray: [query], maxCrawledPlacesPerSearch: limit, language: "en" };
  const items = await requestJson(
    url,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    { timeoutMs: config_timeout(ctx), retries: ctx.config.limits?.max_retries ?? 3, logger: ctx.logger }
  );
  return Array.isArray(items) ? items : [];
}

function config_timeout(ctx) {
  return ctx.config.limits?.request_timeout_ms ?? 30000;
}

// Map both fixture records and live Apify records into one shape.
function normalize(p) {
  if (!p) return null;
  return {
    title: p.title || p.name || "Unknown",
    address: p.address || p.formattedAddress || "",
    phone: p.phone || p.phoneUnformatted || "",
    website: p.website || p.websiteUri || "",
    rating: Number(p.rating ?? p.totalScore ?? 0) || 0,
    ratingCount: Number(p.ratingCount ?? p.reviewsCount ?? 0) || 0,
    category: p.category || p.categoryName || "",
    placeId: p.placeId || p.id || "",
  };
}
