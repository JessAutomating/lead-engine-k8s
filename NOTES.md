# NOTES: Pipeline Stage Map (Phase 0 Study)

This file records the STRUCTURE of the source automation so the standalone runner
can faithfully reproduce the pattern. It contains no secrets, no real spreadsheet
IDs, no real targeting lists, and no client identities. The source workflows were
read for structure only.

## Origin

The pattern originates from two scheduled automations that run a weekly batch
lead-generation pipeline. Both share an identical node graph and differ only in
their schedule and their input list of market segments:

| Source automation | Schedule        | Cron equivalent |
| ----------------- | --------------- | --------------- |
| Region One batch  | Monday 12:00 am | `0 0 * * 1`     |
| Region Two batch  | Monday 6:00 am  | `0 6 * * 1`     |

Each automation is triggered by a weekly schedule node, expands a configured list
of market segments, and processes each segment through the same five-stage pipeline.

## Pipeline stages and credential TYPES

The pipeline is a five-stage flow. The reference automations implement each stage
with a specific vendor; the standalone runner in this repo reproduces the same
stage contract using the canonical credential types listed below. Only the type of
credential matters here, never a value.

| Stage  | Purpose                                   | Canonical credential TYPE | Auth shape                |
| ------ | ----------------------------------------- | ------------------------- | ------------------------- |
| scrape | Find candidate businesses per segment     | Apify                     | API token (header)        |
| enrich | Crawl each candidate website for content  | Firecrawl                 | API key (bearer)          |
| score  | Rank fit and extract outreach fields      | Anthropic (Claude)        | API key (header)          |
| write  | Append scored rows to a tracker sheet     | Google Sheets             | OAuth access token        |
| notify | Send a run summary to the operator        | Gmail                     | OAuth access token        |

No credential VALUES were read or copied. The source MCP does not expose secret
values, and none were requested.

## Control flow (sanitized)

The node graph below is the reproduced logical flow. Branch gates are kept because
they are the interesting structural part for a batch pipeline.

```
weekly schedule trigger
  -> build segment list (from config, not hardcoded)
  -> for each segment (batched loop):
       -> scrape: search provider returns candidate businesses
       -> parse + region filter (keep in-area results only)
       -> gate: has valid results?  no  -> next segment
       -> gate: has website?
            no  -> flag "no website" (still a strong lead) -> score
            yes -> enrich: crawl website, truncate audit text to a char limit
       -> score: model returns JSON {score, pain_points, recommended_services,
                 estimated_project_value, outreach_angle, business_summary,
                 contact_email}
       -> parse score, attach segment + run metadata
       -> gate: valid score?  no  -> next segment
       -> gate: score >= segment threshold?
            yes -> write qualified row to tracker
            no  -> write row to low-score log
       -> next segment
  -> notify: send run summary to operator
```

## Fields produced per lead (sanitized schema)

The tracker schema observed in the source is reproduced as a generic, non-identifying
set of columns:

```
scan_date, region, segment, business_name, business_address, business_phone,
business_website, business_rating, business_category, has_website, lead_score,
pain_points, recommended_services, estimated_project_value, outreach_angle,
business_summary, contact_email
```

## What was deliberately NOT carried over

- Real API keys, tokens, and OAuth credentials (never exposed by the source).
- The real spreadsheet ID and tab IDs (replaced with a placeholder env var).
- The real, granular market-segment list (replaced with generic placeholder segments).
- The vendor-specific scoring prompt and its company identity (rewritten vendor-neutral).
- Any client or business identity.

## Why this maps cleanly to a Kubernetes CronJob

The source is a time-triggered, idempotent, finite batch job: it wakes on a weekly
schedule, processes a bounded list, writes results, and exits. That is exactly the
workload shape a Kubernetes CronJob is designed to run. Phases 1 through 4 lift this
batch into a container and schedule it with two CronJobs whose cron strings match the
two source schedules above.
