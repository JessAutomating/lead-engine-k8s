// Stage 5: notify. Send a run summary to the operator.
// Canonical credential type: Gmail (OAuth access token).
// --dry-run renders the email and logs it instead of sending.

import { requestJson } from "../http.js";

export function buildSummaryEmail({ summary, ctx }) {
  const prefix = ctx.config.notify?.subject_prefix || "[Lead Engine]";
  const subject = `${prefix} ${summary.region} run: ${summary.qualified} qualified / ${summary.total} scanned`;

  const lines = [
    `Region: ${summary.region}`,
    `Scanned: ${summary.total}`,
    `Qualified: ${summary.qualified}`,
    `Low score: ${summary.lowScore}`,
    `No website: ${summary.noWebsite}`,
    "",
    "Per segment:",
    ...summary.perSegment.map((s) => `  ${s.segment}: ${s.qualified} qualified / ${s.scanned} scanned`),
    "",
    "Top leads:",
    ...summary.topLeads.map((l) => `  ${l.lead_score}  ${l.business_name} (${l.segment})`),
  ];

  return { subject, body: lines.join("\n") };
}

export async function notify({ summary, ctx }) {
  const email = buildSummaryEmail({ summary, ctx });

  if (ctx.dryRun) {
    ctx.logger.stage("notify", "would send summary email (dry-run)", {
      to: ctx.env.notifyTo || "operator@example.com",
      subject: email.subject,
    });
    // Surface the rendered body so a dry run shows exactly what would be sent.
    process.stdout.write("\n----- summary email preview -----\n");
    process.stdout.write(`Subject: ${email.subject}\n\n${email.body}\n`);
    process.stdout.write("---------------------------------\n\n");
    return { sent: false, ...email };
  }

  const mime = [
    `From: ${ctx.env.notifyFrom}`,
    `To: ${ctx.env.notifyTo}`,
    `Subject: ${email.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    email.body,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");

  await requestJson(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ctx.env.googleToken}`,
      },
      body: JSON.stringify({ raw }),
    },
    {
      timeoutMs: ctx.config.limits?.request_timeout_ms ?? 30000,
      retries: ctx.config.limits?.max_retries ?? 3,
      logger: ctx.logger,
    }
  );
  ctx.logger.stage("notify", "sent summary email", { to: ctx.env.notifyTo, subject: email.subject });
  return { sent: true, ...email };
}
