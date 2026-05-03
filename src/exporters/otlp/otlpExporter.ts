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
import { toOtlpPayload } from "./otelAdapter";
import { compressPayload } from "../../utils/compression";
import { safeStringify } from "../../utils/safeJson";
import { Locale } from "../../locale";
import { interpolate } from "../../utils/interpolate";
import {
  MAX_BEACON_PAYLOAD_BYTES,
  EXPORT_REQUEST_TIMEOUT_MS,
} from "../../constants";

/**
 * OtlpExporter sends telemetry batches to an OTel Collector via OTLP/HTTP.
 * Uses gzip compression where available (Chrome/Edge).
 * Falls back to uncompressed for Firefox/Safari.
 * Never reads the response body — only checks HTTP status.
 */
export class OtlpExporter implements Exporter {
  private readonly config: ResolvedConfig;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  async export(batch: ProcessedEvent[]): Promise<void> {
    const otlpPayload = toOtlpPayload(batch);
    const payloadString = safeStringify(otlpPayload);
    const { data: payloadBody, encoding } = await compressPayload(payloadString);

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...this.config.exporter.headers,
    };

    if (encoding) {
      requestHeaders["Content-Encoding"] = encoding;
    }

    if (this.config.exporter.apiKey) {
      requestHeaders["Authorization"] = `Bearer ${this.config.exporter.apiKey}`;
    }

    const abortController = new AbortController();
    const timeoutId = setTimeout(
      () => abortController.abort(),
      EXPORT_REQUEST_TIMEOUT_MS
    );

    let exportResponse: Response;

    try {
      exportResponse = await fetch(this.config.exporter.url, {
        method: "POST",
        headers: requestHeaders,
        body: payloadBody,
        signal: abortController.signal,
      });
    } catch (networkError) {
      clearTimeout(timeoutId);
      throw new TelemetryError(
        `Network error exporting to Collector: ${networkError instanceof Error ? networkError.message : "Unknown"}`,
        networkError instanceof Error ? networkError : undefined
      );
    } finally {
      clearTimeout(timeoutId);
    }

    // Never read response body — only check status code
    if (!exportResponse.ok) {
      throw new TelemetryError(
        `HTTP ${exportResponse.status} from Collector`
      );
    }

    if (this.config.debug) {
      console.log(
        interpolate(Locale.exporter.exportSuccess, {
          eventCount: batch.length,
          durationMs: 0, // We don't track individual export duration
        })
      );
    }
  }

  /**
   * Synchronous flush using navigator.sendBeacon for page unload.
   * Recursively splits payload if it exceeds the 64KB sendBeacon limit.
   * Cannot send API key headers — sendBeacon limitation.
   */
  exportSync(batch: ProcessedEvent[]): void {
    if (
      typeof navigator === "undefined" ||
      typeof navigator.sendBeacon !== "function"
    ) {
      return;
    }

    if (this.config.debug && this.config.exporter.apiKey) {
      console.warn(Locale.exporter.noApiKeyBeacon);
    }

    this.sendBeaconRecursive(batch);
  }

  private sendBeaconRecursive(batch: ProcessedEvent[]): void {
    if (batch.length === 0) return;

    const otlpPayload = toOtlpPayload(batch);
    const payloadString = safeStringify(otlpPayload);

    if (payloadString.length <= MAX_BEACON_PAYLOAD_BYTES) {
      const beaconBlob = new Blob([payloadString], {
        type: "application/json",
      });
      navigator.sendBeacon(this.config.exporter.url, beaconBlob);
      return;
    }

    if (this.config.debug) {
      console.warn(Locale.exporter.beaconPayloadTooLarge);
    }

    // Split batch in half and recurse
    const midpoint = Math.floor(batch.length / 2);
    this.sendBeaconRecursive(batch.slice(0, midpoint));
    this.sendBeaconRecursive(batch.slice(midpoint));
  }
}
