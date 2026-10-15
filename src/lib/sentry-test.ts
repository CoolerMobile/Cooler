export interface SentryTestScope {
  setTag(key: string, value: string): unknown
  setContext(name: string, context: Record<string, unknown>): unknown
}

export interface SentryTestClient {
  withScope<T>(callback: (scope: SentryTestScope) => T): T | undefined
  captureException(error: unknown): string | undefined
  flush(): Promise<boolean>
}

/**
 * Sends a handled test exception through an initialized Sentry client.
 *
 * This accepts the client as an argument so its behavior can be unit tested
 * without loading the React Native runtime. In the app, call it with the
 * imported `@sentry/react-native` namespace after `Sentry.init` has run.
 */
export const testSentryConnection = async (sentry: SentryTestClient): Promise<string> => {
  const eventId = sentry.withScope((scope) => {
    scope.setTag("test.type", "handled")
    scope.setContext("sentry_test", {
      source: "src/lib/sentry-test.ts",
      runtime: "react-native",
    })

    try {
      throw new Error("Cooler test exception")
    } catch (error) {
      return sentry.captureException(error)
    }
  })

  if (!eventId) {
    throw new Error("Sentry did not create an event ID")
  }

  const flushed = await sentry.flush()
  if (!flushed) {
    throw new Error(`Sentry did not flush event ${eventId}`)
  }

  return eventId
}

/**
 * Intentionally crashes the JavaScript runtime so Sentry's global error
 * handler can be checked manually in a development build.
 */
export const testSentryUncaughtException = (): ReturnType<typeof setTimeout> =>
  setTimeout(() => {
    throw new Error("Cooler uncaught exception")
  }, 100)
