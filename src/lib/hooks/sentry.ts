import * as Sentry from "@sentry/react-native"
import { minimizeSentryEvent } from "@/lib/sentry-privacy"
import { useEffect } from "react"
import { AppState } from "react-native"

const SENTRY_DSN = "https://b891bc92b50d4ac1934b43b74fdef846@tracking.danfq.dev/1"

const ignoredDevelopmentErrors: Array<string | RegExp> = [
  "DebugServerException",
  "UnableToResolveError",
  /The development server returned response error code/,
  /Unable to resolve module .* from/,
]

const excludedIntegrations = new Set([
  "Breadcrumbs",
  "ExpoConstants",
  "ExpoContext",
  "ExpoUpdatesListener",
  "HttpContext",
  "ModulesLoader",
  "TurboModuleContext",
])

/**
 * cocoa options the react native types don't declare
 *
 * the sdk forwards keys it doesn't know to the native init, and the ios sdk reads
 * these from that dictionary; android ignores them
 */
type CocoaOptions = {
  enableAutoBreadcrumbTracking?: boolean
  enableNetworkBreadcrumbs?: boolean
  enableMetricKit?: boolean
  enableMetricKitRawPayload?: boolean
  enablePreWarmedAppStartTracing?: boolean
  reportAccessibilityIdentifier?: boolean
}

const sentryOptions: Sentry.ReactNativeOptions & CocoaOptions = {
  dsn: SENTRY_DSN,
  environment: __DEV__ ? "development" : "production",
  enableAutoSessionTracking: false,
  ignoreErrors: __DEV__ ? ignoredDevelopmentErrors : [],
  integrations: (integrations) =>
    integrations.filter((integration) => !excludedIntegrations.has(integration.name)),
  beforeBreadcrumb: () => null,
  beforeSend: minimizeSentryEvent,
  sendClientReports: false,
  enableLogs: false,
  maxBreadcrumbs: 0,
  maxValueLength: 2_000,
  enableNative: true,
  autoInitializeNativeSdk: true,
  enableNativeCrashHandling: !__DEV__,
  enableNdk: !__DEV__,
  enableNdkScopeSync: false,
  enableWatchdogTerminationTracking: !__DEV__,
  enableAppHangTracking: !__DEV__,
  enableMetricKit: false,
  enableMetricKitRawPayload: false,
  enableAutoPerformanceTracing: false,
  enableAppStartTracking: false,
  enablePreWarmedAppStartTracing: false,
  enableNativeFramesTracking: false,
  enableStallTracking: false,
  enableUserInteractionTracing: false,
  enableCaptureFailedRequests: false,
  enableNetworkBreadcrumbs: false,
  enableAutoBreadcrumbTracking: false,
  // Preserve JavaScript call chains and native thread stacks. The beforeSend allowlist removes
  // runtime locals while retaining source-map-derived function names and source context.
  attachStacktrace: true,
  attachThreads: true,
  attachScreenshot: false,
  attachViewHierarchy: false,
  reportAccessibilityIdentifier: false,
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
