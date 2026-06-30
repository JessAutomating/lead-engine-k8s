// Stage 4: write. Append scored rows to the tracker sheet.
// Canonical credential type: Google Sheets (OAuth access token).
// --dry-run keeps rows in memory and logs the count instead of writing.

import { requestJson } from "../http.js";

const COLUMNS = [
  "scan_date",
  "region",
  "segment",
  "business_name",
  "business_address",
  "business_phone",
  "business_website",
  "business_rating",
  "business_category",
  "has_website",
  "lead_score",
  "pain_points",
  "recommended_services",
  "estimated_project_value",
  "outreach_angle",
  "business_summary",
  "contact_email",
];

export function toRow(lead) {
  return [
    lead.scan_date,
    lead.region,
    lead.segment,
    lead.business_name,
    lead.business_address,
    lead.business_phone,
    lead.business_website,
    String(lead.business_rating ?? ""),
    lead.business_category,
    lead.has_website,
    String(lead.lead_score ?? ""),
    (lead.pain_points || []).join("; "),
    (lead.recommended_services || []).join("; "),
    lead.estimated_project_value || "",
    lead.outreach_angle || "",
    lead.business_summary || "",
    lead.contact_email || "",
  ];
}

export async function writeRows({ rows, tab, ctx }) {
  if (rows.length === 0) return 0;

  if (ctx.dryRun) {
    ctx.logger.stage("write", "would append rows (dry-run)", { tab, rows: rows.length });
    ctx.dryStore.push({ tab, rows });
    return rows.length;
  }

  const range = `${tab}!A1`;
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(ctx.env.sheetId)}` +
    `/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
  await requestJson(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.env.googleToken}`,
      },
      body: JSON.stringify({ values: rows.map(toRow) }),
    },
    {
      timeoutMs: ctx.config.limits?.request_timeout_ms ?? 30000,
      retries: ctx.config.limits?.max_retries ?? 3,
      logger: ctx.logger,
    }
  );
  ctx.logger.stage("write", "appended rows", { tab, rows: rows.length });
  return rows.length;
}

export { COLUMNS };
