// Minimal structured logger with secret redaction.
// Every line is JSON so it reads cleanly out of `kubectl logs`.

export function createLogger(secretValues = []) {
  // Keep only non-trivial secret strings so we never redact empty values.
  const secrets = secretValues.filter((v) => typeof v === "string" && v.length >= 6);

  function redact(input) {
    let text = typeof input === "string" ? input : JSON.stringify(input);
    for (const secret of secrets) {
      text = text.split(secret).join("***REDACTED***");
    }
    return text;
  }

  function emit(level, msg, fields = {}) {
    const line = { ts: new Date().toISOString(), level, msg, ...fields };
    // Redact the fully serialized line so secrets cannot leak through any field.
    process.stdout.write(redact(JSON.stringify(line)) + "\n");
  }

  return {
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    stage: (stage, msg, fields) => emit("info", msg, { stage, ...fields }),
    redact,
  };
}
