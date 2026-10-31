const { getSentryExpoConfig } = require("@sentry/react-native/metro")
const { withNativeWind } = require("nativewind/metro")

// use sentry's expo metro config so debug ids are injected through the asset
// serialization plugin instead of the custom serializer, which crashes under
// metro 0.84 during `expo export:embed` (reading 'match' of undefined)
const config = getSentryExpoConfig(__dirname, {
  includeWebReplay: false,
})
config.resolver.assetExts.push("md")

module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: 16,
})
