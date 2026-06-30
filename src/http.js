// Tiny fetch wrapper: timeout via AbortController plus retry with backoff on
// transient failures (429 and 5xx). Used only in REAL mode; --dry-run never
// calls this, so the runner makes zero network requests when mocked.

export async function requestJson(url, options = {}, { timeoutMs = 30000, retries = 3, logger } = {}) {
  let attempt = 0;
  let lastError;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (res.status === 429 || res.status >= 500) {
        throw new Error(`Retryable HTTP ${res.status} from ${safeUrl(url)}`);
      }
      const text = await res.text();
      const body = text ? safeParse(text) : null;
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${safeUrl(url)}`);
        err.status = res.status;
        err.body = body;
        throw err;
      }
      return body;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      const retryable = err.name === "AbortError" || /Retryable HTTP/.test(err.message);
      if (!retryable || attempt === retries) break;
      const backoff = Math.min(1000 * 2 ** attempt, 8000);
      logger?.warn("http retry", { url: safeUrl(url), attempt: attempt + 1, backoff_ms: backoff });
      await sleep(backoff);
      attempt += 1;
    }
  }
  throw lastError;
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// Strip query strings so tokens passed as params never reach the logs.
function safeUrl(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return String(url).split("?")[0];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
