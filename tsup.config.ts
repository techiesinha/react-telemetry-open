import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    renders: "src/signals/renders/index.ts",
    interactions: "src/signals/interactions/index.ts",
    routes: "src/signals/routes/index.ts",
    "custom-events": "src/signals/events/index.ts",
    "exporters/console": "src/exporters/console/index.ts",
    "exporters/otlp": "src/exporters/otlp/index.ts",
    testing: "src/testing/index.tsx",
  },
  format: ["esm", "cjs"],
  dts: true,
  splitting: true,
  treeshake: true,
  minify: true,
  sourcemap: true,
  clean: true,
  external: [
    "react",
    "react-dom",
    "@opentelemetry/api",
    "@opentelemetry/sdk-trace-web",
  ],
  esbuildOptions(options) {
    options.target = "es2020";
    options.define = {
      // Replace the version placeholder with the actual package version at build time.
      // npm sets npm_package_version when running scripts — guaranteed to be correct.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      "__PACKAGE_VERSION__": JSON.stringify(
        process.env["npm_package_version"] ?? "1.0.0"
      ),
      // We deliberately do NOT define process.env.* here.
      // Doing so would bake environment variable values into the published package —
      // a serious security risk if secrets are set in the build environment.
      // process.env access is left as-is for the consumer's own bundler to handle.
    };
  },
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".esm.js" : ".cjs.js",
    };
  },
});
