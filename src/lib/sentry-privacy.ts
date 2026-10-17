import type { ErrorEvent, Exception, StackFrame, Thread } from "@sentry/react-native"

const APP_CONTEXT_FIELDS = [
  "app_identifier",
  "app_version",
  "build_type",
  "app_memory",
  "free_memory",
  "in_foreground",
] as const

const DEVICE_CONTEXT_FIELDS = [
  "family",
  "model",
  "model_id",
  "arch",
  "manufacturer",
  "brand",
  "simulator",
  "memory_size",
  "free_memory",
  "usable_memory",
  "low_memory",
  "processor_count",
  "cpu_description",
  "processor_frequency",
  "screen_resolution",
  "screen_height_pixels",
  "screen_width_pixels",
  "screen_density",
  "screen_dpi",
  "device_type",
] as const

const OS_CONTEXT_FIELDS = ["name", "version", "build", "kernel_version", "rooted"] as const
const RUNTIME_CONTEXT_FIELDS = ["name", "version"] as const
const REACT_NATIVE_CONTEXT_FIELDS = [
  "turbo_module",
  "fabric",
  "react_native_version",
  "expo",
  "expo_go_version",
  "expo_sdk_version",
  "js_engine",
  "hermes_version",
  "hermes_debug_info",
] as const

const SAFE_TAGS = new Set([
  "background.task",
  "event.environment",
  "event.origin",
  "execution.context",
  "hermes",
])

const MAX_ERROR_MESSAGE_LENGTH = 2_000
const MAX_STACK_FRAMES = 100
const MAX_SOURCE_CONTEXT_LINES = 5

const copyFields = (
  context: Record<string, unknown> | undefined,
  fields: readonly string[]
): Record<string, unknown> | undefined => {
  if (!context) return undefined

  const result: Record<string, unknown> = {}
  for (const field of fields) {
    if (context[field] !== undefined) result[field] = context[field]
  }

  return Object.keys(result).length > 0 ? result : undefined
}

/**
 * Removes common identifiers from error text. Error messages remain useful, but callers should
 * still avoid putting user-provided values or secrets in thrown errors in the first place.
 */
export const redactSentryErrorText = (value: string | undefined): string | undefined => {
  if (!value) return value

  return value
    .replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/gi, "[url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, "[id]")
    .replace(/\b(?:[0-9a-f]{32,}|[A-Za-z0-9_-]{40,})\b/g, "[secret]")
    .replace(/\/(?:Users|home)\/[^/\s]+/g, "/[user]")
    .replace(/\\Users\\[^\\\s]+/gi, "\\[user]")
    .slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

const minimizeFrame = (frame: StackFrame): StackFrame => ({
  filename: frame.filename,
  function: frame.function,
  module: frame.module,
  platform: frame.platform,
  lineno: frame.lineno,
  colno: frame.colno,
  abs_path: frame.abs_path,
  in_app: frame.in_app,
  instruction_addr: frame.instruction_addr,
  addr_mode: frame.addr_mode,
  debug_id: frame.debug_id,
  // These values are source-map-derived application code, not runtime values. Keeping a small
  // window makes a symbolicated frame actionable without collecting local variables.
  pre_context: frame.pre_context?.slice(-MAX_SOURCE_CONTEXT_LINES),
  context_line: frame.context_line,
  post_context: frame.post_context?.slice(0, MAX_SOURCE_CONTEXT_LINES),
})

const minimizeThread = (thread: Thread): Thread => ({
  id: thread.id,
  name: thread.name,
  crashed: thread.crashed,
  current: thread.current,
  main: thread.main,
  stacktrace: thread.stacktrace
    ? {
        frames: thread.stacktrace.frames?.slice(-MAX_STACK_FRAMES).map(minimizeFrame),
        frames_omitted: thread.stacktrace.frames_omitted,
      }
    : undefined,
})

const minimizeException = (exception: Exception): Exception => ({
  type: redactSentryErrorText(exception.type),
  value: redactSentryErrorText(exception.value),
  module: exception.module,
  thread_id: exception.thread_id,
  mechanism: exception.mechanism
    ? {
        type: exception.mechanism.type,
        handled: exception.mechanism.handled,
        synthetic: exception.mechanism.synthetic,
        source: exception.mechanism.source,
        is_exception_group: exception.mechanism.is_exception_group,
        exception_id: exception.mechanism.exception_id,
        parent_id: exception.mechanism.parent_id,
      }
    : undefined,
  stacktrace: exception.stacktrace
    ? {
        frames: exception.stacktrace.frames?.slice(-MAX_STACK_FRAMES).map(minimizeFrame),
        frames_omitted: exception.stacktrace.frames_omitted,
      }
    : undefined,
})

/**
 * Uses an allowlist so newly-added SDK fields cannot silently expand the error payload. Stack
 * traces and non-identifying device/runtime details are retained for diagnosis.
 */
export const minimizeSentryEvent = (event: ErrorEvent): ErrorEvent => {
  const contexts = {
    app: copyFields(event.contexts?.app, APP_CONTEXT_FIELDS),
    device: copyFields(event.contexts?.device, DEVICE_CONTEXT_FIELDS),
    os: copyFields(event.contexts?.os, OS_CONTEXT_FIELDS),
    runtime: copyFields(event.contexts?.runtime, RUNTIME_CONTEXT_FIELDS),
    react_native_context: copyFields(event.contexts?.react_native_context, REACT_NATIVE_CONTEXT_FIELDS),
  }

  const tags = Object.fromEntries(
    Object.entries(event.tags ?? {})
      .filter(([key]) => SAFE_TAGS.has(key))
      .map(([key, value]) => [key, typeof value === "string" ? redactSentryErrorText(value) : value])
  )

  return {
    type: undefined,
    event_id: event.event_id,
    timestamp: event.timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    dist: event.dist,
    environment: event.environment,
    sdk: event.sdk,
    message: event.exception?.values?.length ? undefined : redactSentryErrorText(event.message),
    exception: event.exception?.values
      ? { values: event.exception.values.map(minimizeException) }
      : undefined,
    threads: event.threads?.values ? { values: event.threads.values.map(minimizeThread) } : undefined,
    contexts: Object.values(contexts).some(Boolean) ? contexts : undefined,
    tags: Object.keys(tags).length > 0 ? tags : undefined,
    debug_meta: event.debug_meta,
  }
}
