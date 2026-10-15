import { beforeEach, describe, expect, mock, test } from "bun:test"
import { testSentryConnection, type SentryTestClient, type SentryTestScope } from "@/lib/sentry-test"

const tags = new Map<string, string>()
const contexts = new Map<string, Record<string, unknown>>()

const scope: SentryTestScope = {
  setTag(key, value) {
    tags.set(key, value)
  },
  setContext(name, context) {
    contexts.set(name, context)
  },
}

const captureException = mock((_error: unknown): string | undefined => "event-id")
const flush = mock(async (): Promise<boolean> => true)

const sentry: SentryTestClient = {
  withScope(callback) {
    return callback(scope)
  },
  captureException,
  flush,
}

beforeEach(() => {
  tags.clear()
  contexts.clear()
  captureException.mockClear()
  captureException.mockImplementation(() => "event-id")
  flush.mockClear()
  flush.mockImplementation(async () => true)
})

describe("testSentryConnection", () => {
  test("captures and flushes a tagged handled exception", async () => {
    await expect(testSentryConnection(sentry)).resolves.toBe("event-id")

    expect(tags.get("test.type")).toBe("handled")
    expect(contexts.get("sentry_test")).toEqual({
      source: "src/lib/sentry-test.ts",
      runtime: "react-native",
    })
    expect(captureException).toHaveBeenCalledTimes(1)
    expect(captureException.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect((captureException.mock.calls[0]?.[0] as Error).message).toBe("Cooler test exception")
    expect(flush).toHaveBeenCalledTimes(1)
  })

  test("fails before flushing when Sentry does not create an event ID", async () => {
    captureException.mockImplementation(() => undefined)

    await expect(testSentryConnection(sentry)).rejects.toThrow("Sentry did not create an event ID")
    expect(flush).not.toHaveBeenCalled()
  })

  test("reports the event ID when Sentry cannot flush it", async () => {
    flush.mockImplementation(async () => false)

    await expect(testSentryConnection(sentry)).rejects.toThrow("Sentry did not flush event event-id")
  })
})
