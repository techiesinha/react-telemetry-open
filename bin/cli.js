#!/usr/bin/env node

/**
 * Copyright 2026 Abhishek Sinha (sinha@live.in)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

// ─── Locale strings — no hardcoded strings below ──────────────────────────────

const CLI_MESSAGES = {
  ciDetected:
    "CI environment detected. The init command is for local development only. Exiting.",
  noPackageJson:
    "No package.json found in the current directory. Are you in your project root?",
  fileExists: (fileName) =>
    `${fileName} already exists. Your config has not been changed.\nRun with --force to overwrite.`,
  forceConfirmPrompt:
    "This will overwrite your existing telemetry.config.json. Continue? (y/N): ",
  forceAborted: "Aborted. Your existing config has not been changed.",
  monoRepoDetected:
    "Multiple package.json files detected. This appears to be a monorepo.",
  monoRepoPrompt:
    "Where should the config be created? (Enter the path relative to current directory, or press Enter for current directory): ",
  promptAppName: (detected) =>
    `App name (detected: "${detected}"): `,
  promptExporter:
    "Exporter type:\n  1) console — prints to DevTools (recommended for development)\n  2) otlp   — sends to OTel Collector (recommended for production)\nChoice [1]: ",
  promptRouter:
    "Router:\n  1) React Router 6\n  2) Next.js\n  3) None / Other\nChoice [1]: ",
  success: (files) =>
    `\n✅ Created: ${files.join(", ")}\n\nNext steps:\n\n  1. Add to your app entry point (main.tsx / index.tsx):\n\n     import { TelemetryProvider } from 'react-telemetry-open'\n     import appConfig from '../telemetry.config.json'\n\n     <TelemetryProvider appConfig={appConfig}>\n       <App />\n     </TelemetryProvider>\n\n     appConfig  = static identity (name, version, env) — from the JSON file\n     config     = runtime overrides (sampling, consent) — optional, pass separately\n\n  2. Open DevTools console — telemetry appears with your app name and version\n\n  3. For production:\n     → Update exporter.type to "otlp" in telemetry.config.prod.json\n     → Pass the prod config as the prop in production builds`,
};

// ─── CI detection ─────────────────────────────────────────────────────────────

const isCI = () =>
  Boolean(
    process.env.CI ||
    process.env.CONTINUOUS_INTEGRATION ||
    process.env.JENKINS_URL ||
    process.env.CIRCLECI ||
    process.env.TRAVIS ||
    process.env.GITHUB_ACTIONS
  );

// ─── Monorepo detection ───────────────────────────────────────────────────────

const findPackageJsonFiles = (dir, depth = 0) => {
  if (depth > 2) return [];
  const found = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === "package.json") {
        found.push(fullPath);
      } else if (entry.isDirectory()) {
        found.push(...findPackageJsonFiles(fullPath, depth + 1));
      }
    }
  } catch {
    // Directory not readable — skip
  }
  return found;
};

// ─── Config file generation ───────────────────────────────────────────────────

const buildBaseConfig = (appName, appVersion, exporterType) => {
  const baseConfig = {
    app: {
      name: appName,
      version: appVersion,
      environment: "development",
    },
    exporter: {
      type: exporterType === "otlp" ? "console" : "console",
    },
    signals: {
      renders: true,
      interactions: true,
      routes: true,
      errors: true,
      network: true,
      memory: true,
      longTasks: true,
      webVitals: true,
      customEvents: true,
      resourceTiming: false,
    },
    batch: {
      size: 50,
      flushIntervalMs: 5000,
      maxQueueSize: 500,
    },
    privacy: {
      stripQueryParams: true,
      respectDoNotTrack: true,
    },
    ignore: {
      components: [],
      urls: [],
    },
    debug: true,
  };

  return JSON.stringify(baseConfig, null, 2);
};

const buildProdConfig = () => {
  const prodConfig = {
    app: {
      environment: "production",
      buildId: "$REACT_APP_BUILD_ID",
    },
    exporter: {
      type: "otlp",
      url: "$REACT_APP_OTEL_URL",
      apiKey: "$REACT_APP_OTEL_KEY",
    },
    sampling: {
      rate: 0.1,
    },
    debug: false,
  };

  return JSON.stringify(prodConfig, null, 2);
};

// ─── Interactive prompts ──────────────────────────────────────────────────────

const ask = (rl, question) =>
  new Promise((resolve) => rl.question(question, resolve));

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async () => {
  const args = process.argv.slice(2);
  const isForce = args.includes("--force");
  const cwd = process.cwd();

  // CI guard
  if (isCI()) {
    console.log(CLI_MESSAGES.ciDetected);
    process.exit(0);
  }

  // package.json check
  const packageJsonPath = path.join(cwd, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    console.error(CLI_MESSAGES.noPackageJson);
    process.exit(1);
  }

  // Read detected app name and version from package.json
  let detectedAppName = "my-app";
  let detectedAppVersion = "0.0.0";
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    detectedAppName = packageJson.name ?? "my-app";
    detectedAppVersion = packageJson.version ?? "0.0.0";
  } catch {
    // Could not read package.json
  }

  const configPath = path.join(cwd, "telemetry.config.json");
  const prodConfigPath = path.join(cwd, "telemetry.config.prod.json");

  // File exists check
  if (fs.existsSync(configPath) && !isForce) {
    console.log(CLI_MESSAGES.fileExists("telemetry.config.json"));
    process.exit(0);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Force confirmation
  if (fs.existsSync(configPath) && isForce) {
    const confirmation = await ask(rl, CLI_MESSAGES.forceConfirmPrompt);
    if (!confirmation.trim().toLowerCase().startsWith("y")) {
      console.log(CLI_MESSAGES.forceAborted);
      rl.close();
      process.exit(0);
    }
  }

  console.log("\nSetting up react-telemetry-open...\n");

  // Question 1 — App name
  const appNameAnswer = await ask(rl, CLI_MESSAGES.promptAppName(detectedAppName));
  const appName = appNameAnswer.trim() || detectedAppName;

  // Question 2 — Exporter type
  const exporterAnswer = await ask(rl, CLI_MESSAGES.promptExporter);
  const exporterChoice = exporterAnswer.trim() || "1";
  const exporterType = exporterChoice === "2" ? "otlp" : "console";

  // Question 3 — Router (informational — we auto-detect at runtime)
  await ask(rl, CLI_MESSAGES.promptRouter);

  rl.close();

  // Write config files
  const createdFiles = [];

  const baseConfigContent =
    buildBaseConfig(appName, detectedAppVersion, exporterType);

  fs.writeFileSync(configPath, baseConfigContent, "utf-8");
  createdFiles.push("telemetry.config.json");

  if (!fs.existsSync(prodConfigPath)) {
    const prodConfigContent = buildProdConfig();
    fs.writeFileSync(prodConfigPath, prodConfigContent, "utf-8");
    createdFiles.push("telemetry.config.prod.json");
  }



  console.log(CLI_MESSAGES.success(createdFiles));
};

main().catch((error) => {
  console.error("react-telemetry-open init failed:", error.message);
  process.exit(1);
});
