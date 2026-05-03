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

import type { ProcessedEvent } from "../../types/internal";
import type { Exporter } from "../../core/exporterManager";

const PLACEHOLDERS = new Set(["unknown-app", "0.0.0", "unknown", ""]);
const isReal = (v: string | null | undefined): v is string =>
  typeof v === "string" && !PLACEHOLDERS.has(v);

/**
 * ConsoleExporter — prints telemetry events to the browser DevTools console.
 * Intended for development use only.
 *
 * Context groups (App, Session, Device, Browser, Network) are collapsed by
 * default. Fields with placeholder values (unknown-app, 0.0.0, unknown) are
 * suppressed — only real data is shown.
 */
export class ConsoleExporter implements Exporter {
  async export(batch: ProcessedEvent[]): Promise<void> {
    for (const event of batch) {
      console.group(
        `%c[react-telemetry-open] ${event.name}`,
        "color: #7c3aed; font-weight: bold;"
      );

      // ── Signal ────────────────────────────────────────────────────────
      console.log("Type:     ", event.type);
      console.log("Route:    ", event.route || "(none)");
      console.log("Timestamp:", new Date(event.timestamp).toISOString());
      if (event.duration !== undefined) {
        console.log("Duration: ", `${event.duration.toFixed(2)}ms`);
      }
      if (event.value !== undefined) {
        console.log("Value:    ", event.value, event.unit ?? "");
      }
      if (Object.keys(event.attributes).length > 0) {
        console.log("Attributes:", event.attributes);
      }

      // ── App — always shown so developer knows what is configured ─────
      console.groupCollapsed("App");
      console.log("name:       ", event.app.name);
      console.log("version:    ", event.app.version);
      console.log("environment:", event.app.environment);
      console.log("buildId:    ", event.app.buildId);
      console.groupEnd();

      // ── Session ───────────────────────────────────────────────────────
      console.groupCollapsed("Session");
      console.log("id:       ", event.session.id);
      console.log("duration: ", `${Math.round(event.session.duration / 1000)}s`);
      console.log("pageViews:", event.session.pageViews);
      console.groupEnd();

      // ── Device ────────────────────────────────────────────────────────
      console.groupCollapsed("Device");
      console.log("type:    ", event.device.type);
      console.log("viewport:", `${event.device.viewport.width}×${event.device.viewport.height}`);
      if (event.device.memory !== null) {
        console.log("memory:  ", `${event.device.memory}GB`);
      }
      console.log("cpuCores:", event.device.cpuCores);
      console.groupEnd();

      // ── Browser ───────────────────────────────────────────────────────
      console.groupCollapsed("Browser");
      console.log("name:    ", event.browser.name);
      console.log("version: ", event.browser.version);
      console.log("language:", event.browser.language);
      console.log("os:      ", `${event.os.name} ${event.os.version}`.trim());
      console.groupEnd();

      // ── Network ───────────────────────────────────────────────────────
      console.groupCollapsed("Network");
      console.log("online:  ", event.network.online);
      if (isReal(event.network.type) && event.network.type !== "unknown") {
        console.log("type:    ", event.network.type);
      }
      if (event.network.downlink !== null) {
        console.log("downlink:", `${event.network.downlink}Mbps`);
      }
      if (event.network.rtt !== null) {
        console.log("rtt:     ", `${event.network.rtt}ms`);
      }
      if (event.network.saveData) {
        console.log("saveData:", true);
      }
      console.groupEnd();

      console.groupEnd();
    }
  }

  exportSync(batch: ProcessedEvent[]): void {
    for (const event of batch) {
      const app: Record<string, string> = {};
      if (isReal(event.app.name))        app["name"] = event.app.name;
      if (isReal(event.app.version))     app["version"] = event.app.version;
      if (isReal(event.app.environment)) app["environment"] = event.app.environment;
      if (isReal(event.app.buildId))     app["buildId"] = event.app.buildId;

      const network: Record<string, string | boolean | number> = {
        online: event.network.online,
      };
      if (isReal(event.network.type) && event.network.type !== "unknown") {
        network["type"] = event.network.type;
      }
      if (event.network.downlink !== null) network["downlink"] = `${event.network.downlink}Mbps`;
      if (event.network.rtt !== null)      network["rtt"] = `${event.network.rtt}ms`;
      if (event.network.saveData)          network["saveData"] = true;

      console.log(`[react-telemetry-open] ${event.name}`, {
        signal: {
          type: event.type,
          route: event.route || undefined,
          timestamp: new Date(event.timestamp).toISOString(),
          ...(event.duration !== undefined ? { duration: `${event.duration.toFixed(2)}ms` } : {}),
          ...(event.value !== undefined ? { value: event.value, unit: event.unit } : {}),
          attributes: event.attributes,
        },
        app: {
          name: event.app.name,
          version: event.app.version,
          environment: event.app.environment,
          buildId: event.app.buildId,
        },
        session: {
          id: event.session.id,
          duration: `${Math.round(event.session.duration / 1000)}s`,
          pageViews: event.session.pageViews,
        },
        device: {
          type: event.device.type,
          viewport: `${event.device.viewport.width}×${event.device.viewport.height}`,
          ...(event.device.memory !== null ? { memory: `${event.device.memory}GB` } : {}),
          cpuCores: event.device.cpuCores,
        },
        browser: {
          name: event.browser.name,
          version: event.browser.version,
          language: event.browser.language,
          os: `${event.os.name} ${event.os.version}`.trim(),
        },
        network,
      });
    }
  }
}
