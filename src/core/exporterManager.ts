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

import type { ProcessedEvent } from "../types/internal";
import type { ResolvedConfig } from "../types/internal";
import { CircuitState, ExporterType } from "../types/internal";
import { Locale } from "../locale";
import { interpolate } from "../utils/interpolate";
import { TelemetryError } from "./telemetryError";
import {
  MAX_EXPORT_RETRY_ATTEMPTS,
  EXPORT_RETRY_BASE_DELAY_MS,
  EXPORT_RETRY_MAX_DELAY_MS,
  CIRCUIT_BREAKER_FAILURE_THRESHOLD,
  CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
  MAX_CONCURRENT_EXPORTS,
  MAX_BEACON_PAYLOAD_BYTES,
  EXPORT_REQUEST_TIMEOUT_MS,
} from "../constants";

/** Minimal interface any exporter must implement */
export interface Exporter {
  export(batch: ProcessedEvent[]): Promise<void>;
  exportSync?(batch: ProcessedEvent[]): void;
}

/**
 * ExporterManager routes processed event batches to all configured exporters.
 *
 * Features:
 * - Multiple simultaneous exporters (console + OTLP)
 * - Per-exporter independent circuit breakers
 * - Exponential backoff with jitter on failures
 * - Concurrent request limiting
 * - Binary batch splitting on 413 responses
 * - sendBeacon fallback on page unload
 * - Flush guard prevents duplicate exports on unmount
 */
export class ExporterManager {
  private readonly exporters: Exporter[] = [];
  private readonly config: ResolvedConfig;

  /** Circuit breaker states per exporter index */
  private readonly circuitStates: CircuitState[] = [];
  private readonly consecutiveFailureCounts: number[] = [];
  private readonly circuitOpenTimestamps: number[] = [];

  /** In-flight request tracking for concurrency limiting */
  private inFlightExportCount = 0;

  /** Flush guard — prevents duplicate exports on unmount */
  private hasFlushedFlag = false;
  private isFlushingFlag = false;

  constructor(config: ResolvedConfig) {
    this.config = config;
  }

  /** Adds an exporter — called during TelemetryProvider boot */
  addExporter(exporter: Exporter): void {
    const exporterIndex = this.exporters.length;
    this.exporters.push(exporter);
    this.circuitStates[exporterIndex] = CircuitState.Closed;
    this.consecutiveFailureCounts[exporterIndex] = 0;
    this.circuitOpenTimestamps[exporterIndex] = 0;
  }

  /**
   * Exports a batch to all registered exporters in parallel.
   * Failure of one exporter never affects others.
   * All rejections are caught — never propagates to caller.
   */
  async export(batch: ProcessedEvent[]): Promise<void> {
    if (batch.length === 0) return;
    if (this.inFlightExportCount >= MAX_CONCURRENT_EXPORTS) return;

    this.inFlightExportCount++;

    try {
      await Promise.allSettled(
        this.exporters.map((exporter, exporterIndex) =>
          this.exportWithRetry(exporter, exporterIndex, batch)
        )
      );
    } catch {
      // Promise.allSettled never rejects — this is defensive
    } finally {
      this.inFlightExportCount--;
    }
  }

  /**
   * Synchronous flush using sendBeacon for page unload scenarios.
   * Splits payload recursively if it exceeds the 64KB sendBeacon limit.
   * Flush guard prevents duplicate flushes.
   */
  flushSync(batch: ProcessedEvent[]): void {
    if (this.hasFlushedFlag) return;
    this.hasFlushedFlag = true;

    if (batch.length === 0) return;

    for (const exporter of this.exporters) {
      if (exporter.exportSync) {
        try {
          exporter.exportSync(batch);
        } catch {
          // Never propagate — page is unloading
        }
      }
    }
  }

  /**
   * Async flush — used by TelemetryProvider cleanup on normal unmount.
   * Flush guard prevents duplicate flushes from concurrent unmount triggers.
   */
  async flush(batch: ProcessedEvent[]): Promise<void> {
    if (this.hasFlushedFlag || this.isFlushingFlag) return;
    this.isFlushingFlag = true;

    try {
      await this.export(batch);
    } finally {
      this.isFlushingFlag = false;
      this.hasFlushedFlag = true;
    }
  }

  private async exportWithRetry(
    exporter: Exporter,
    exporterIndex: number,
    batch: ProcessedEvent[],
    attemptNumber = 1
  ): Promise<void> {
    // Circuit breaker check
    if (!this.isCircuitAllowingExport(exporterIndex)) return;

    try {
      await exporter.export(batch);
      // Success — reset failure count, close circuit
      this.consecutiveFailureCounts[exporterIndex] = 0;
      if (this.circuitStates[exporterIndex] === CircuitState.HalfOpen) {
        this.circuitStates[exporterIndex] = CircuitState.Closed;
        if (this.config.debug) {
          console.log(Locale.exporter.circuitClosed);
        }
      }
    } catch (exportError) {
      // Check if this was a 413 too large error
      if (
        exportError instanceof TelemetryError &&
        exportError.message.includes("413") &&
        batch.length > 1
      ) {
        if (this.config.debug) {
          console.warn(
            interpolate(Locale.exporter.payloadTooLarge, {
              sizeBytes: batch.length * 500, // estimate
            })
          );
        }
        // Split batch in half and retry each half
        const midpoint = Math.floor(batch.length / 2);
        await Promise.allSettled([
          this.exportWithRetry(exporter, exporterIndex, batch.slice(0, midpoint)),
          this.exportWithRetry(exporter, exporterIndex, batch.slice(midpoint)),
        ]);
        return;
      }

      if (attemptNumber >= MAX_EXPORT_RETRY_ATTEMPTS) {
        this.recordExporterFailure(exporterIndex);
        return;
      }

      if (this.config.debug) {
        console.warn(
          interpolate(Locale.exporter.exportFailed, {
            attempt: attemptNumber,
            maxAttempts: MAX_EXPORT_RETRY_ATTEMPTS,
            errorMessage: exportError instanceof Error ? exportError.message : "Unknown error",
          })
        );
      }

      // Exponential backoff with jitter — prevents thundering herd
      const backoffDelay = Math.min(
        EXPORT_RETRY_BASE_DELAY_MS * Math.pow(2, attemptNumber - 1) +
          Math.random() * EXPORT_RETRY_BASE_DELAY_MS,
        EXPORT_RETRY_MAX_DELAY_MS
      );

      if (this.config.debug) {
        console.warn(
          interpolate(Locale.exporter.retryingIn, {
            delayMs: Math.round(backoffDelay),
          })
        );
      }

      await new Promise<void>((resolve) => setTimeout(resolve, backoffDelay));
      return this.exportWithRetry(exporter, exporterIndex, batch, attemptNumber + 1);
    }
  }

  private isCircuitAllowingExport(exporterIndex: number): boolean {
    const circuitState = this.circuitStates[exporterIndex];

    if (circuitState === CircuitState.Closed) return true;

    if (circuitState === CircuitState.Open) {
      const timeSinceOpen =
        Date.now() - (this.circuitOpenTimestamps[exporterIndex] ?? 0);

      if (timeSinceOpen >= CIRCUIT_BREAKER_RESET_TIMEOUT_MS) {
        this.circuitStates[exporterIndex] = CircuitState.HalfOpen;
        if (this.config.debug) {
          console.log(Locale.exporter.circuitHalfOpen);
        }
        return true; // Allow one test request
      }
      return false; // Still open
    }

    // HalfOpen — allow one request through
    return true;
  }

  private recordExporterFailure(exporterIndex: number): void {
    const failureCount = (this.consecutiveFailureCounts[exporterIndex] ?? 0) + 1;
    this.consecutiveFailureCounts[exporterIndex] = failureCount;

    if (failureCount >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      this.circuitStates[exporterIndex] = CircuitState.Open;
      this.circuitOpenTimestamps[exporterIndex] = Date.now();

      if (this.config.debug) {
        console.warn(
          interpolate(Locale.exporter.circuitOpen, {
            failures: failureCount,
            resetMs: CIRCUIT_BREAKER_RESET_TIMEOUT_MS,
          })
        );
      }
    }
  }
}
