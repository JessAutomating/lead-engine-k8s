// Stage 3: score. Rank fit and extract outreach fields as JSON.
// Reference automation used Claude; the canonical credential type here is
// Anthropic. The prompt is vendor neutral. --dry-run uses a deterministic local
// heuristic so the full pipeline can be exercised with zero model spend.

import { requestJson } from "../http.js";

const SYSTEM_PROMPT = [
  "You are a B2B lead-scoring assistant.",
  "Given a business and an audit of its website, score 1-10 how strong a fit it is",
  "for digital modernization and automation services. Higher means more opportunity.",
  "No website => 9-10. Basic template site => 7-8. Dated but functional => 6-7.",
  "Modern with minor gaps => 4-5. Polished and complete => 1-3.",
  "Frame pain_points and outreach_angle in plain business terms (time lost, bookings",
  "missed, revenue left on the table), never in technical terms.",
  "Return ONLY JSON with keys: score (number), pain_points (string array),",
  "recommended_services (string array), estimated_project_value (string),",
  "outreach_angle (string), business_summary (string), contact_email (string).",
].join(" ");

export async function score({ business, audit, flaggedNoWebsite, ctx }) {
  if (ctx.dryRun) {
    return mockScore(business, audit, flaggedNoWebsite);
  }
  return await scoreAnthropic({ business, audit, ctx });
}

// Deterministic heuristic that mirrors the model's scoring rubric closely enough
// to exercise every downstream branch. No randomness, so tests stay stable.
function mockScore(business, audit, flaggedNoWebsite) {
  const a = (audit || "").toLowerCase();
  let s;
  if (flaggedNoWebsite || !business.website) {
    s = 9;
  } else {
    s = 5;
    if ((business.rating || 0) < 4.0) s += 2;
    if ((business.ratingCount || 0) < 50) s += 1;
    if (/wix|squarespace|godaddy|weebly/.test(a)) s += 2;
    if (/shopify|next\.js|react|gatsby/.test(a)) s -= 1;
    s = Math.max(1, Math.min(10, s));
  }

  const domain = business.website ? business.website.replace(/^https?:\/\//, "").split("/")[0] : "";
  return {
    score: s,
    pain_points:
      s >= 7
        ? ["Hard to find and book online, so weekend leads go cold", "Manual intake eats staff hours"]
        : ["Mostly modern, smaller efficiency gaps in follow-up"],
    recommended_services:
      s >= 7 ? ["website build or redesign", "online booking", "automated follow-up"] : ["workflow automation"],
    estimated_project_value: s >= 8 ? "$8k-$15k" : s >= 6 ? "$4k-$8k" : "$2k-$4k",
    outreach_angle:
      s >= 7
        ? "Every booking goes through phone tag today, so after-hours interest slips away."
        : "A few small automations could quietly save a couple of hours each week.",
    business_summary: `${business.category || "Local business"} in ${business.region || "the target region"}.`,
    contact_email: domain ? `info@${domain}` : "",
  };
}

async function scoreAnthropic({ business, audit, ctx }) {
  const userContent =
    `Score this lead:\n` +
    `Business: ${business.title || "Unknown"}\n` +
    `Category: ${business.category || "Unknown"}\n` +
    `Address: ${business.address || "N/A"}\n` +
    `Website: ${business.website || "NONE"}\n` +
    `Rating: ${business.rating || "N/A"} (${business.ratingCount || 0} reviews)\n\n` +
    `Website audit:\n${audit || "No audit data available"}`;

  const res = await requestJson(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": ctx.env.anthropicKey,
      },
      body: JSON.stringify({
        model: ctx.config.scoring?.model || "claude-haiku-4-5-20251001",
        max_tokens: ctx.config.scoring?.max_tokens || 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
    },
    {
      timeoutMs: ctx.config.limits?.request_timeout_ms ?? 30000,
      retries: ctx.config.limits?.max_retries ?? 3,
      logger: ctx.logger,
    }
  );

  const text = res?.content?.[0]?.text ?? "";
  const clean = text.replace(/```json\s*/g, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {
    ctx.logger.warn("score parse failed, defaulting to 0", { business: business.title });
    return { score: 0 };
  }
}
