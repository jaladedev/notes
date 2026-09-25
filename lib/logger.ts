/**
 * Lightweight structured logging, replacing ad-hoc console.error calls.
 *
 * Every entry is a single JSON line (level, message, timestamp, and any
 * context you pass in) instead of a free-form string plus loose extra
 * console.error arguments — that makes entries greppable and parseable
 * by whatever collects stdout in production (Vercel's log drains,
 * `vercel logs`, etc).
 *
 * This is intentionally the *only* place that talks to a real logging
 * backend. To integrate Sentry, Logtail, or another provider later,
 * change the body of `emit()` — every call site (`logger.error(...)`
 * etc.) stays the same.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function serializeError(err: unknown): unknown {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
      ...(err.cause !== undefined ? { cause: serializeError(err.cause) } : {}),
    };
  }
  return err;
}

// JSON.stringify's replacer runs on every key at every depth, so this
// catches Error instances (which otherwise serialize to "{}") wherever
// they show up in the context object — top-level or nested.
function jsonSafeReplacer(_key: string, value: unknown) {
  return value instanceof Error ? serializeError(value) : value;
}

function emit(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? { context } : {}),
  };

  const line = JSON.stringify(entry, jsonSafeReplacer);

  // eslint-disable-next-line no-console -- this is the one sanctioned console call
  const write = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  write(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
};
