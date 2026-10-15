import * as Sentry from "@sentry/react-native"
import { useEffect } from "react"
import { AppState } from "react-native"

const SENTRY_DSN = "https://b891bc92b50d4ac1934b43b74fdef846@tracking.danfq.dev/1"

const ignoredDevelopmentErrors: Array<string | RegExp> = [
  "DebugServerException",
  "UnableToResolveError",
  /The development server returned response error code/,
  /Unable to resolve module .* from/,
]

const sentryOptions: Sentry.ReactNativeOptions = {
  dsn: SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
  enableAutoSessionTracking: false,
  ignoreErrors: __DEV__ ? ignoredDevelopmentErrors : [],
  tracesSampleRate: __DEV__ ? 0 : 0.01,
  enableLogs: false,
  maxBreadcrumbs: 50,
  enableNative: true,
  autoInitializeNativeSdk: true,
  enableNativeCrashHandling: !__DEV__,
  enableNdk: !__DEV__,
  enableTombstone: !__DEV__,
  enableHistoricalTombstoneReporting: false,
  enableWatchdogTerminationTracking: !__DEV__,
  enableAppHangTracking: !__DEV__,
  attachStacktrace: true,
  attachScreenshot: !__DEV__,
  attachViewHierarchy: !__DEV__,
  sendDefaultPii: false,
}

/** initialize before React renders so native and JavaScript crash handlers start early */
export const initializeSentry = () => {
  if (Sentry.getClient()) return
  Sentry.init(sentryOptions)
}

initializeSentry()

const flushSentry = async (): Promise<boolean> => {
  try {
    return await Sentry.flush()
  } catch {
    return false
  }
}

/**
 * records an error handled by a headless/background task and persists its
 * envelope before the OS suspends that task's JavaScript runtime
 */
export const captureBackgroundException = async (
  task: string,
  error: unknown
): Promise<string | undefined> => {
  initializeSentry()

  const eventId = Sentry.withScope((scope) => {
    scope.setTag("execution.context", "background-task")
    scope.setTag("background.task", task)
    return Sentry.captureException(error)
  })

  await flushSentry()
  return eventId
}

/**
 * keeps Sentry synchronized with the app lifecycle
 *
 * native crash handling and offline storage survive React unmounts; queued events are
 * flushed to disk as the app leaves the foreground and sent when the native transport can run
 */
export const useSentry = () => {
  useEffect(() => {
    let currentState = AppState.currentState

    void Sentry.crashedLastRun()
      .then((crashed) => {
        if (!crashed) return

        Sentry.addBreadcrumb({
          category: "app.lifecycle",
          level: "info",
          message: "The previous app run ended in a native crash",
        })
      })
      .catch(() => undefined)

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (currentState === "active" && nextState !== "active") {
        void flushSentry()
      }

      currentState = nextState
    })

    return () => {
      subscription.remove()
      void flushSentry()
    }
  }, [])
}
