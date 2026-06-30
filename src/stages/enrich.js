// Stage 2: enrich. Crawl a candidate website and return trimmed audit text.
// Reference automation used a reader/crawl provider; the canonical credential
// type here is Firecrawl. Businesses with no website skip the crawl and are
// flagged (no website is itself a strong signal for the score stage).

import { readFileSync } from "node:fs";
import { requestJson } from "../http.js";

const FIXTURE = new URL("../../fixtures/firecrawl.sample.json", import.meta.url);
let fixtureCache = null;

export async function enrich({ business, ctx }) {
  const charLimit = ctx.config.limits?.audit_char_limit ?? 2500;

  if (!business.website) {
    ctx.logger.stage("enrich", "no website, flagged", { business: business.title });
    return { audit_content: "", flaggedNoWebsite: true };
  }

  let content;
  if (ctx.dryRun) {
    content = fixtureAudit(business);
  } else {
    content = await crawlFirecrawl({ url: business.website, ctx });
  }

  return { audit_content: String(content || "").slice(0, charLimit), flaggedNoWebsite: false };
}

function fixtureAudit(business) {
  if (!fixtureCache) fixtureCache = JSON.parse(readFileSync(FIXTURE, "utf8"));
  const byWebsite = fixtureCache.byWebsite || {};
  if (byWebsite[business.website]) return byWebsite[business.website];
  return (fixtureCache.default || "Website content for {{name}}.").replaceAll("{{name}}", business.title);
}

async function crawlFirecrawl({ url, ctx }) {
  const data = await requestJson(
    "https://api.firecrawl.dev/v1/scrape",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.env.firecrawlKey}`,
      },
      body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
    },
    {
      timeoutMs: ctx.config.limits?.request_timeout_ms ?? 30000,
      retries: ctx.config.limits?.max_retries ?? 3,
      logger: ctx.logger,
    }
  );
  return data?.data?.markdown ?? data?.markdown ?? "";
}
