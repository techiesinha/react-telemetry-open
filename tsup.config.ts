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
    // __PACKAGE_VERSION__ is a bare identifier in src/constants/defaults.ts
    // esbuild replaces bare identifiers — not string literals
    // npm always sets npm_package_version when running via npm scripts
    options.define = {
      "__PACKAGE_VERSION__": JSON.stringify(process.env["npm_package_version"] ?? "0.0.0"),
    };
  },
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".esm.js" : ".cjs.js",
    };
  },
});
