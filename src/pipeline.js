// Orchestrates the five stages over the configured segments and returns a run
// summary. Mirrors the reference automation: per-segment loop, website gate,
// score gate, threshold split into qualified vs low-score, then one notify.

import { scrape } from "./stages/scrape.js";
import { enrich } from "./stages/enrich.js";
import { score } from "./stages/score.js";
import { writeRows } from "./stages/write.js";
import { notify } from "./stages/notify.js";

export async function runPipeline(ctx) {
  const { config, logger } = ctx;
  const scanDate = new Date().toISOString().slice(0, 10);
  const defaultMin = config.scoring?.min_score_default ?? 7;

  const qualified = [];
  const lowScore = [];
  const perSegment = [];
  let total = 0;
  let noWebsite = 0;
  let invalid = 0;

  logger.info("run start", { region: config.region, segments: config.segments?.length ?? 0, dryRun: ctx.dryRun });

  for (const seg of config.segments ?? []) {
    const minScore = seg.min_score ?? defaultMin;
    const businesses = await scrape({ segment: seg.segment, query: seg.query, ctx });
    let segQualified = 0;

    for (const business of businesses) {
      total += 1;
      const { audit_content, flaggedNoWebsite } = await enrich({ business, ctx });
      if (flaggedNoWebsite) noWebsite += 1;

      const scored = await score({ business, audit: audit_content, flaggedNoWebsite, ctx });
      if (!scored.score || scored.score <= 0) {
        invalid += 1;
        continue;
      }

      const lead = buildLead({ business, scored, scanDate });
      if (scored.score >= minScore) {
        qualified.push(lead);
        segQualified += 1;
      } else {
        lowScore.push(lead);
      }
    }

    perSegment.push({ segment: seg.segment, scanned: businesses.length, qualified: segQualified });
    logger.stage("segment", "segment done", { segment: seg.segment, scanned: businesses.length, qualified: segQualified });
  }

  // Write both buckets to their tabs.
  const qualifiedWritten = await writeRows({ rows: qualified, tab: config.sheets?.tab_qualified || "Qualified", ctx });
  const lowWritten = await writeRows({ rows: lowScore, tab: config.sheets?.tab_low_score || "LowScore", ctx });

  const topLeads = [...qualified].sort((a, b) => b.lead_score - a.lead_score).slice(0, 5);

  const summary = {
    region: config.region,
    total,
    qualified: qualified.length,
    lowScore: lowScore.length,
    noWebsite,
    invalid,
    qualifiedWritten,
    lowWritten,
    perSegment,
    topLeads,
  };

  await notify({ summary, ctx });
  logger.info("run complete", {
    region: summary.region,
    total: summary.total,
    qualified: summary.qualified,
    lowScore: summary.lowScore,
  });

  return summary;
}

function buildLead({ business, scored, scanDate }) {
  return {
    scan_date: scanDate,
    region: business.region,
    segment: business.segment,
    business_name: business.title,
    business_address: business.address,
    business_phone: business.phone,
    business_website: business.website,
    business_rating: business.rating,
    business_category: business.category,
    has_website: business.website ? "Yes" : "No",
    lead_score: scored.score,
    pain_points: scored.pain_points || [],
    recommended_services: scored.recommended_services || [],
    estimated_project_value: scored.estimated_project_value || "",
    outreach_angle: scored.outreach_angle || "",
    business_summary: scored.business_summary || "",
    contact_email: scored.contact_email || "",
  };
}
