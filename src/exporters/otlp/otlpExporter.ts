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
import type { ResolvedConfig } from "../../types/internal";
import type { Exporter } from "../../core/exporterManager";
import { TelemetryError } from "../../core/telemetryError";
import { toMetricsPayload, toTracesPayload, toLogsPayload } from "./otelAdapter";
import { compressPayload } from "../../utils/compression";
import { safeStringify } from "../../utils/safeJson";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import {
  MAX_BEACON_PAYLOAD_BYTES,
  EXPORT_REQUEST_TIMEOUT_MS,
} from "../../constants";

/**
 * OTLP signal path suffixes per OTLP/HTTP specification v1.3.2.
 * https://opentelemetry.io/docs/specs/otlp/#otlphttp-request
 */
const OTLP_METRICS_PATH = "/v1/metrics";
const OTLP_TRACES_PATH  = "/v1/traces";
const OTLP_LOGS_PATH    = "/v1/logs";

/**
 * Known OTLP signal paths that a developer might accidentally include
 * in their base URL. Stripped during normalisation.
 */
const OTLP_KNOWN_SUFFIXES = [
  "/v1/traces",
  "/v1/metrics",
  "/v1/logs",
  "/v1/",
];

/**
 * Normalises a raw collector URL to a clean base URL.
 *
 * Handles common developer mistakes:
 *   - Trailing slashes:           https://example.com/otlp/  → https://example.com/otlp
 *   - Signal path included:       https://example.com/otlp/v1/traces → https://example.com/otlp
 *   - Partial path included:      https://example.com/otlp/v1/ → https://example.com/otlp
 *   - Invalid protocol:           ftp://example.com → null (warn)
 *   - Unparseable URL:            not-a-url → null (warn)
 *
 * Returns null if the URL is invalid — caller skips export and warns.
 */
export const normaliseCollectorUrl = (rawUrl: string): string | null => {
  if (!rawUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  // Only http and https are valid for OTLP/HTTP
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }

  // Strip known OTLP signal path suffixes — handles single accidental inclusion
  let path = parsed.pathname;
  for (const suffix of OTLP_KNOWN_SUFFIXES) {
    if (path.endsWith(suffix)) {
      path = path.slice(0, -suffix.length);
      break;
    }
  }

  // Strip any remaining trailing slashes
  path = path.replace(/\/+$/, "");

  return `${parsed.protocol}//${parsed.host}${path}`;
};

/**
 * OtlpExporter sends telemetry batches to an OTel Collector via OTLP/HTTP.
 *
 * Sends three separate requests per batch — one per signal type — to the
 * correct OTLP/HTTP endpoints as defined in the specification:
 *   POST {baseUrl}/v1/metrics
 *   POST {baseUrl}/v1/traces
 *   POST {baseUrl}/v1/logs
 *
 * Uses gzip compression where available (Chrome 80+, Edge 80+, Firefox 113+, Safari 16.4+).
 * Falls back to uncompressed for older browsers.
 * Never reads the response body — only checks HTTP status.
 */
export class OtlpExporter implements Exporter {
  private readonly config: ResolvedConfig;
  private readonly baseUrl: string | null;

  constructor(config: ResolvedConfig) {
    this.config = config;
    this.baseUrl = normaliseCollectorUrl(config.exporter.url);

    if (!this.baseUrl && config.debug) {
      console.warn(
        interpolate(Locale.exporter.invalidCollectorUrl, {
          url: config.exporter.url,
        })
      );
    }
  }

  async export(batch: ProcessedEvent[]): Promise<void> {
    if (!this.baseUrl) return;

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.exporter.headers,
    };

    if (this.config.exporter.apiKey) {
      requestHeaders["Authorization"] = `Bearer ${this.config.exporter.apiKey}`;
    }

    // Send three separate requests — one per signal type per OTLP spec
    const sends: Promise<void>[] = [];

    const metricsPayload = toMetricsPayload(batch);
    if (metricsPayload.resourceMetrics?.length) {
      sends.push(this.sendSignal(
        `${this.baseUrl}${OTLP_METRICS_PATH}`,
        metricsPayload,
        requestHeaders
      ));
    }

    const tracesPayload = toTracesPayload(batch);
    if (tracesPayload.resourceTraces?.length) {
      sends.push(this.sendSignal(
        `${this.baseUrl}${OTLP_TRACES_PATH}`,
        tracesPayload,
        requestHeaders
      ));
    }

    const logsPayload = toLogsPayload(batch);
    if (logsPayload.resourceLogs?.length) {
      sends.push(this.sendSignal(
        `${this.baseUrl}${OTLP_LOGS_PATH}`,
        logsPayload,
        requestHeaders
      ));
    }

    // All three run concurrently — failure of one does not block others
    await Promise.all(sends);

    if (this.config.debug) {
      console.log(
        interpolate(Locale.exporter.exportSuccess, {
          eventCount: batch.length,
          durationMs: 0,
        })
      );
    }
  }

  private async sendSignal(
    url: string,
    payload: object,
    headers: Record<string, string>
  ): Promise<void> {
    const payloadString = safeStringify(payload);
    const { data: payloadBody, encoding } = await compressPayload(payloadString);

    const requestHeaders = { ...headers };
    if (encoding) {
      requestHeaders["Content-Encoding"] = encoding;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      EXPORT_REQUEST_TIMEOUT_MS
    );

    let response: Response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: payloadBody,
        signal: abortController.signal,
      });
    } catch (networkError) {
      clearTimeout(timeoutId);
      throw new TelemetryError(
        `Network error exporting to ${url}: ${networkError instanceof Error ? networkError.message : "Unknown"}`,
        networkError instanceof Error ? networkError : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new TelemetryError(`HTTP ${response.status} from ${url}`);
    }
  }

  /**
   * Synchronous flush on page unload using navigator.sendBeacon.
   * sendBeacon cannot set custom headers so apiKey cannot be sent.
   * Splits payload if it exceeds the 64KB sendBeacon limit.
   */
  exportSync(batch: ProcessedEvent[]): void {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.sendBeacon !== "function" ||
      !this.baseUrl
    ) {
      return;
    }

    if (this.config.debug && this.config.exporter.apiKey) {
      console.warn(Locale.exporter.noApiKeyBeacon);
    }

    // Send each signal type to its correct path
    const metricsPayload = toMetricsPayload(batch);
    if (metricsPayload.resourceMetrics?.length) {
      this.sendBeaconRecursive(
        `${this.baseUrl}${OTLP_METRICS_PATH}`,
        batch.filter((e) => e.type === "metric")
      );
    }

    const tracesPayload = toTracesPayload(batch);
    if (tracesPayload.resourceTraces?.length) {
      this.sendBeaconRecursive(
        `${this.baseUrl}${OTLP_TRACES_PATH}`,
        batch.filter((e) => e.type === "span")
      );
    }

    const logsPayload = toLogsPayload(batch);
    if (logsPayload.resourceLogs?.length) {
      this.sendBeaconRecursive(
        `${this.baseUrl}${OTLP_LOGS_PATH}`,
        batch.filter((e) => e.type === "log")
      );
    }
  }

  private sendBeaconRecursive(url: string, batch: ProcessedEvent[]): void {
    if (batch.length === 0) return;

    const payload = batch[0]?.type === "metric"
      ? toMetricsPayload(batch)
      : batch[0]?.type === "span"
        ? toTracesPayload(batch)
        : toLogsPayload(batch);

    const payloadString = safeStringify(payload);

    if (payloadString.length <= MAX_BEACON_PAYLOAD_BYTES) {
      const blob = new Blob([payloadString], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }

    if (this.config.debug) {
      console.warn(Locale.exporter.beaconPayloadTooLarge);
    }

    const midpoint = Math.floor(batch.length / 2);
    this.sendBeaconRecursive(url, batch.slice(0, midpoint));
    this.sendBeaconRecursive(url, batch.slice(midpoint));
  }
}
