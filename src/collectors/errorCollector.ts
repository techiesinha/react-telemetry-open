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

import type { ResolvedConfig } from "../types/internal";
import { MetricName, SignalType } from "../types/internal";
import type { SignalBus } from "../core/signalBus";
import { isTelemetryError } from "../core/telemetryError";
import { getWallClockTime } from "../utils/timing";
import { addWindowListener } from "../utils/browserEnvironment";
import { ERROR_DEDUP_STACK_CHARS } from "../constants";

/**
 * ErrorCollector captures three categories of errors:
 *   1. Synchronous JS errors via window.addEventListener('error')
 *   2. Unhandled Promise rejections via window.addEventListener('unhandledrejection')
 *   3. React ErrorBoundary catches via TelemetryErrorBoundary component
 *
 * IMPORTANT: initEarly() must be called SYNCHRONOUSLY before children render,
 * not inside useEffect, to capture errors that occur during first render.
 *
 * Protections:
 * - isTelemetryError check prevents tracking our own export errors (feedback loop)
 * - Cross-origin script errors are filtered — they contain no useful information
 * - Consecutive identical errors are deduplicated to prevent dashboard noise
 */
export class ErrorCollector {
  private static isInitialised = false;
  private static signalBus: SignalBus | null = null;
  private static config: ResolvedConfig | null = null;

  /** Cleanup functions for event listeners */
  private static readonly listenerCleanupFunctions: Array<() => void> = [];

  /** Tracks current-tick emission to prevent same-error double-emit */
  private static emittingSignature: string | null = null;
  private static originalOnerror: typeof window.onerror = null;

  static get initialised(): boolean {
    return ErrorCollector.isInitialised;
  }

  /**
   * Initialises error collection SYNCHRONOUSLY.
   * Must be called before children render to catch first-render errors.
   * Uses a ref-like pattern (isInitialised flag) that is reset on destroy()
   * to handle React StrictMode double-mount correctly.
   *
   * Intercepts BOTH window.addEventListener('error') AND window.onerror because
   * React 18 re-throws event handler errors via window.onerror, not via
   * dispatchEvent — meaning addEventListener alone misses them.
   */
  static initEarly(signalBus: SignalBus, config: ResolvedConfig): void {
    if (ErrorCollector.isInitialised) return;
    if (!config.signals.errors) return;
    if (typeof window === "undefined") return;


    ErrorCollector.isInitialised = true;
    ErrorCollector.signalBus = signalBus;
    ErrorCollector.config = config;

    // Channel 1 — addEventListener('error'): catches script errors, async errors
    const cleanupSyncErrors = addWindowListener<ErrorEvent>(
      "error",
      ErrorCollector.handleSyncError
    );

    // Channel 2 — window.onerror: catches React 18 event handler errors
    // React re-throws these via window.onerror not via dispatchEvent
    ErrorCollector.originalOnerror = window.onerror;
    window.onerror = function (
      message: string | Event,
      source?: string,
      lineno?: number,
      colno?: number,
      error?: Error
    ): boolean {
      if (error && !isTelemetryError(error)) {
        ErrorCollector.emitError({
          message: typeof message === "string" ? message : String(message),
          filename: source ?? null,
          line: lineno ?? null,
          column: colno ?? null,
          stack: error.stack ?? null,
          errorType: error.constructor?.name ?? "Error",
        });
      }
      const original = ErrorCollector.originalOnerror;
      if (typeof original === "function") {
        return original.call(window, message, source, lineno, colno, error) ?? false;
      }
      return false;
    };

    const cleanupRejections = addWindowListener<PromiseRejectionEvent>(
      "unhandledrejection",
      ErrorCollector.handleUnhandledRejection
    );

    ErrorCollector.listenerCleanupFunctions.push(
      cleanupSyncErrors,
      () => {
        window.onerror = ErrorCollector.originalOnerror;
        ErrorCollector.originalOnerror = null;
      },
      cleanupRejections
    );
  }

  static destroy(): void {
    for (const cleanupFunction of ErrorCollector.listenerCleanupFunctions) {
      cleanupFunction();
    }
    ErrorCollector.listenerCleanupFunctions.length = 0;
    ErrorCollector.signalBus = null;
    ErrorCollector.config = null;
    ErrorCollector.emittingSignature = null;
    ErrorCollector.originalOnerror = null;
    // Reset initialised flag — allows re-init on StrictMode remount
    ErrorCollector.isInitialised = false;
  }

  private static handleSyncError = (errorEvent: ErrorEvent): void => {
    if (!ErrorCollector.signalBus) return;

    // Cross-origin scripts report "Script error." with no useful details
    if (
      errorEvent.message === "Script error." &&
      !errorEvent.filename
    ) {
      return;
    }

    // Skip our own telemetry errors — prevents feedback loops
    if (isTelemetryError(errorEvent.error)) return;

    ErrorCollector.emitError({
      message: errorEvent.message,
      filename: errorEvent.filename,
      line: errorEvent.lineno,
      column: errorEvent.colno,
      stack: (errorEvent.error as Error | null)?.stack ?? null,
      errorType:
        (errorEvent.error as Error | null)?.constructor?.name ?? "Error",
    });
  };

  private static handleUnhandledRejection = (
    rejectionEvent: PromiseRejectionEvent
  ): void => {
    if (!ErrorCollector.signalBus) return;

    const rejectionReason = rejectionEvent.reason;
    if (isTelemetryError(rejectionReason)) return;

    const errorMessage =
      rejectionReason instanceof Error
        ? rejectionReason.message
        : typeof rejectionReason === "string"
        ? rejectionReason
        : "Unhandled promise rejection";

    const errorStack =
      rejectionReason instanceof Error ? rejectionReason.stack ?? null : null;

    const errorSignature = `${errorMessage}|${errorStack?.slice(0, ERROR_DEDUP_STACK_CHARS) ?? ""}`;

    if (ErrorCollector.emittingSignature === errorSignature) return;
    ErrorCollector.emittingSignature = errorSignature;
    queueMicrotask(() => { ErrorCollector.emittingSignature = null; });

    ErrorCollector.signalBus.emit({
      type: SignalType.Log,
      name: MetricName.UnhandledRejection,
      timestamp: getWallClockTime(),
      route: "",
      sessionId: "",
      attributes: {
        message: errorMessage,
        stack: errorStack,
        errorType: rejectionReason instanceof Error
          ? rejectionReason.constructor.name
          : typeof rejectionReason,
        isUnhandledRejection: true,
      } as Record<string, string | number | boolean | null>,
    });
  };

  /**
   * Emits an error event with deduplication.
   * Uses a 200ms window to suppress duplicates from both window.onerror
   * and addEventListener('error') firing for the same error simultaneously.
   * Consecutive identical errors beyond that are emitted every Nth occurrence.
   */
  private static emitError(attributes: Record<string, unknown>): void {
    if (!ErrorCollector.signalBus) return;

    const errorSignature = `${attributes["message"]}|${
      attributes["errorType"]
    }|${String(attributes["stack"] ?? "").slice(0, ERROR_DEDUP_STACK_CHARS)}`;

    // Same-tick dedup only — blocks the double-emit from React 18's dual-channel
    // error reporting (window.onerror + addEventListener both fire for the same error
    // in the same JS tick). Every subsequent tick is always emitted — no cross-tick
    // suppression. Queue cap (maxQueueSize) and circuit breaker handle storm protection.
    if (ErrorCollector.emittingSignature === errorSignature) return;
    ErrorCollector.emittingSignature = errorSignature;
    queueMicrotask(() => { ErrorCollector.emittingSignature = null; });

    ErrorCollector.signalBus.emit({
      type: SignalType.Log,
      name: MetricName.JsError,
      timestamp: getWallClockTime(),
      route: "",
      sessionId: "",
      attributes: attributes as Record<string, string | number | boolean | null>,
    });
  }
}
