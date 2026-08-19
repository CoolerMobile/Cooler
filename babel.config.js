module.exports = function (api) {
  api.cache(true);
  return {
    plugins: ["react-native-worklets/plugin"],
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
  };
};
