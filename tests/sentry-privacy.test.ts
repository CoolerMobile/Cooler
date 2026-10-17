import { describe, expect, test } from "bun:test"
import type { ErrorEvent } from "@sentry/react-native"
import { minimizeSentryEvent, redactSentryErrorText } from "@/lib/sentry-privacy"

describe("Sentry privacy", () => {
  test("redacts common identifiers from error messages", () => {
    expect(
      redactSentryErrorText(
        "Request for jane@example.com at https://coolify.example.com/api?id=secret from 192.168.1.4 failed for 4f782266-cbed-4a16-a3bb-238083580dc0"
      )
    ).toBe("Request for [email] at [url] from [ip] failed for [id]")
  })

  test("retains diagnostic fields and removes user, request, and arbitrary context data", () => {
    const event: ErrorEvent = {
      type: undefined,
      event_id: "event-id",
      message: "duplicate message",
      transaction: "/servers/private-server",
      server_name: "Jane's iPhone",
      request: {
        url: "https://private.example.com/users/jane",
        headers: { Authorization: "Bearer secret" },
      },
      user: { id: "user-id", email: "jane@example.com", ip_address: "192.168.1.4" },
      breadcrumbs: [{ message: "Opened Jane's deployment" }],
      extra: { token: "secret" },
      modules: { privateModule: "1.0.0" },
      tags: {
        "event.origin": "javascript",
        "background.task": "cooler-deployment-monitor",
        "private.server": "Jane's server",
      },
      contexts: {
        app: { app_identifier: "com.danfq.cooler", app_version: "1.2.3", view_names: ["secret"] },
        device: {
          name: "Jane's iPhone",
          family: "iPhone",
          model: "iPhone 17 Pro",
          device_unique_identifier: "device-id",
          battery_level: 0.5,
        },
        os: { name: "iOS", version: "26.0", build: "23A123" },
        culture: { locale: "pt-PT", timezone: "Europe/Lisbon" },
        runtime: { name: "Hermes", version: "1.0", custom: "secret" },
        react_native_context: {
          react_native_version: "0.86.3",
          js_engine: "hermes",
          component_stack: "PrivateComponent",
        },
      },
      exception: {
        values: [
          {
            type: "Error",
            value: "GET https://private.example.com/user/jane failed for jane@example.com",
            mechanism: {
              type: "generic",
              handled: true,
              data: { target: "private-value" },
            },
            stacktrace: {
              frames: [
                {
                  filename: "app:///index.jsbundle",
                  function: "refreshDeployments",
                  lineno: 42,
                  colno: 7,
                  vars: { token: "secret" },
                  pre_context: ["const token = getSecret()"],
                  context_line: "fetch(server.token)",
                  post_context: ["return response"],
                },
              ],
            },
          },
        ],
      },
      threads: {
        values: [
          {
            id: 1,
            name: "main",
            current: true,
            stacktrace: {
              frames: [
                {
                  function: "UIApplicationMain",
                  filename: "Cooler",
                  lineno: 10,
                  vars: { privateRuntimeValue: "secret" },
                },
              ],
            },
          },
        ],
      },
    }

    expect(minimizeSentryEvent(event)).toEqual({
      type: undefined,
      event_id: "event-id",
      timestamp: undefined,
      level: undefined,
      platform: undefined,
      release: undefined,
      dist: undefined,
      environment: undefined,
      sdk: undefined,
      message: undefined,
      exception: {
        values: [
          {
            type: "Error",
            value: "GET [url] failed for [email]",
            module: undefined,
            thread_id: undefined,
            mechanism: {
              type: "generic",
              handled: true,
              synthetic: undefined,
              source: undefined,
              is_exception_group: undefined,
              exception_id: undefined,
              parent_id: undefined,
            },
            stacktrace: {
              frames: [
                {
                  filename: "app:///index.jsbundle",
                  function: "refreshDeployments",
                  module: undefined,
                  platform: undefined,
                  lineno: 42,
                  colno: 7,
                  abs_path: undefined,
                  in_app: undefined,
                  instruction_addr: undefined,
                  addr_mode: undefined,
                  debug_id: undefined,
                  pre_context: ["const token = getSecret()"],
                  context_line: "fetch(server.token)",
                  post_context: ["return response"],
                },
              ],
              frames_omitted: undefined,
            },
          },
        ],
      },
      threads: {
        values: [
          {
            id: 1,
            name: "main",
            crashed: undefined,
            current: true,
            main: undefined,
            stacktrace: {
              frames: [
                {
                  filename: "Cooler",
                  function: "UIApplicationMain",
                  module: undefined,
                  platform: undefined,
                  lineno: 10,
                  colno: undefined,
                  abs_path: undefined,
                  in_app: undefined,
                  instruction_addr: undefined,
                  addr_mode: undefined,
                  debug_id: undefined,
                  pre_context: undefined,
                  context_line: undefined,
                  post_context: undefined,
                },
              ],
              frames_omitted: undefined,
            },
          },
        ],
      },
      contexts: {
        app: { app_identifier: "com.danfq.cooler", app_version: "1.2.3" },
        device: { family: "iPhone", model: "iPhone 17 Pro" },
        os: { name: "iOS", version: "26.0", build: "23A123" },
        runtime: { name: "Hermes", version: "1.0" },
        react_native_context: { react_native_version: "0.86.3", js_engine: "hermes" },
      },
      tags: {
        "event.origin": "javascript",
        "background.task": "cooler-deployment-monitor",
      },
      debug_meta: undefined,
    })
  })
})
