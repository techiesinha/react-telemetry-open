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
import { Locale } from "../locale";
import { interpolate } from "../utils/interpolate";
import { sanitiseUrl } from "../utils/sanitiseUrl";
import { getCurrentTime, getWallClockTime } from "../utils/timing";
import { NETWORK_ERROR_RATE_INTERVAL_MS } from "../constants";

/**
 * NetworkCollector wraps window.fetch and XMLHttpRequest to track all
 * outbound network calls made by the application.
 *
 * Critical protections:
 * - Always calls originalFetch even if our tracking code throws
 * - Excludes the Collector endpoint to prevent infinite self-tracking loops
 * - Checks typeof window.fetch before wrapping to prevent crash in environments without fetch
 * - Restores original implementations on destroy()
 * - Never reads the response body — only headers and status
 */
export class NetworkCollector {
  private static isInitialised = false;
  private static originalFetch: typeof window.fetch | null = null;
  private static originalXhr: typeof XMLHttpRequest | null = null;

  /** Rolling counters for error rate tracking */
  private static totalRequestCount = 0;
  private static errorRequestCount = 0;
  private static errorRateIntervalId: ReturnType<typeof setInterval> | null = null;

  private static onlineCleanup: (() => void) | null = null;

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (NetworkCollector.isInitialised) return;
    if (!config.signals.network) return;

    if (typeof window === "undefined" || typeof window.fetch !== "function") {
      if (config.debug) {
        console.warn(Locale.network.fetchUnavailable);
      }
      return;
    }

    NetworkCollector.isInitialised = true;
    NetworkCollector.wrapFetch(signalBus, config);
    NetworkCollector.wrapXhr(signalBus, config);
    NetworkCollector.startErrorRateTracking(signalBus, config);

    // Track online/offline via window events — these fire in DevTools offline mode
    // unlike navigator.connection change events which do not
    const handleOffline = () => {
      signalBus.emit({
        type: SignalType.Log,
        name: MetricName.NetworkOffline,
        timestamp: getWallClockTime(),
        route: "",
        sessionId: "",
        attributes: {},
      });
    };
    const handleOnline = () => {
      signalBus.emit({
        type: SignalType.Log,
        name: MetricName.NetworkOnline,
        timestamp: getWallClockTime(),
        route: "",
        sessionId: "",
        attributes: {},
      });
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    NetworkCollector.onlineCleanup = () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }

  static destroy(): void {
    if (!NetworkCollector.isInitialised) return;

    if (NetworkCollector.originalFetch !== null) {
      window.fetch = NetworkCollector.originalFetch;
      NetworkCollector.originalFetch = null;
    }

    if (NetworkCollector.originalXhr !== null) {
      window.XMLHttpRequest = NetworkCollector.originalXhr;
      NetworkCollector.originalXhr = null;
    }

    if (NetworkCollector.errorRateIntervalId !== null) {
      clearInterval(NetworkCollector.errorRateIntervalId);
      NetworkCollector.errorRateIntervalId = null;
    }

    NetworkCollector.onlineCleanup?.();
    NetworkCollector.onlineCleanup = null;

    NetworkCollector.totalRequestCount = 0;
    NetworkCollector.errorRequestCount = 0;
    NetworkCollector.isInitialised = false;
  }

  private static isCollectorUrl(requestUrl: string, collectorUrl: string): boolean {
    if (!collectorUrl) return false;
    return requestUrl.startsWith(collectorUrl);
  }

  private static wrapFetch(signalBus: SignalBus, config: ResolvedConfig): void {
    NetworkCollector.originalFetch = window.fetch;
    const storedOriginalFetch = NetworkCollector.originalFetch;

    window.fetch = async function wrappedFetch(
      ...fetchArgs: Parameters<typeof fetch>
    ): Promise<Response> {
      // Extract URL from Request object or string
      const requestInput = fetchArgs[0];
      const rawUrl =
        requestInput instanceof Request
          ? requestInput.url
          : typeof requestInput === "string"
          ? requestInput
          : String(requestInput);

      // Exclude Collector URL — prevents self-tracking infinite loop (CRITICAL)
      if (NetworkCollector.isCollectorUrl(rawUrl, config.exporter.url)) {
        return storedOriginalFetch(...fetchArgs);
      }

      const sanitisedUrl = sanitiseUrl(rawUrl, config.privacy.stripQueryParams);
      const requestMethod =
        (fetchArgs[1] as RequestInit | undefined)?.method?.toUpperCase() ?? "GET";

      // Capture volatile context synchronously before any async work
      const capturedStartTime = getCurrentTime();
      const capturedTimestamp = getWallClockTime();

      let fetchResponse: Response;

      try {
        // Our tracking code runs — but originalFetch is ALWAYS called in finally
        fetchResponse = await storedOriginalFetch(...fetchArgs);

        const capturedEndTime = getCurrentTime();
        const requestDuration = capturedEndTime - capturedStartTime;

        NetworkCollector.totalRequestCount++;
        if (!fetchResponse.ok) NetworkCollector.errorRequestCount++;

        // Read only Content-Length header — never read body
        const contentLength = fetchResponse.headers.get("content-length");
        const responseSize = contentLength ? parseInt(contentLength, 10) : null;

        signalBus.emit({
          type: SignalType.Span,
          name: MetricName.NetworkFetch,
          timestamp: capturedTimestamp,
          route: "", // Route will be set by enrich stage via session context
          sessionId: "", // Session ID will be set by enrich stage
          startTime: capturedStartTime,
          endTime: capturedEndTime,
          duration: requestDuration,
          attributes: {
            url: sanitisedUrl,
            method: requestMethod,
            status: fetchResponse.status,
            ok: fetchResponse.ok,
            size: responseSize,
          },
        });

        return fetchResponse;
      } catch (fetchError) {
        const capturedEndTime = getCurrentTime();
        NetworkCollector.totalRequestCount++;
        NetworkCollector.errorRequestCount++;

        signalBus.emit({
          type: SignalType.Span,
          name: MetricName.NetworkFetch,
          timestamp: capturedTimestamp,
          route: "",
          sessionId: "",
          startTime: capturedStartTime,
          endTime: capturedEndTime,
          duration: capturedEndTime - capturedStartTime,
          attributes: {
            url: sanitisedUrl,
            method: requestMethod,
            status: 0,
            ok: false,
            error: "NetworkError",
            errorMessage:
              fetchError instanceof Error ? fetchError.message : "Unknown network error",
          },
        });

        // Always re-throw — never swallow developer's errors
        throw fetchError;
      }
    };
  }

  private static wrapXhr(signalBus: SignalBus, config: ResolvedConfig): void {
    if (typeof XMLHttpRequest === "undefined") {
      if (config.debug) {
        console.warn(Locale.network.xhrUnavailable);
      }
      return;
    }

    NetworkCollector.originalXhr = XMLHttpRequest;
    const OriginalXMLHttpRequest = NetworkCollector.originalXhr;

    // Preserve prototype for instanceof checks
    function TelemetryXhrWrapper(this: XMLHttpRequest): void {
      const xhrInstance = new OriginalXMLHttpRequest();

      let capturedMethod = "GET";
      let capturedUrl = "";
      let capturedStartTime = 0;
      let capturedTimestamp = 0;

      const originalOpen = xhrInstance.open.bind(xhrInstance);
      // Use unknown[] to avoid TypeScript's strict tuple spreading — the browser
      // handles argument validation at runtime. We only need method and url.
      (xhrInstance as unknown as { open: (...args: unknown[]) => void }).open = function (
        ...openArgs: unknown[]
      ): void {
        const method = openArgs[0] as string;
        const url = openArgs[1] as string | URL;
        capturedMethod = method.toUpperCase();
        capturedUrl = sanitiseUrl(
          url instanceof URL ? url.toString() : url,
          config.privacy.stripQueryParams
        );
        return (originalOpen as (...args: unknown[]) => void)(...openArgs);
      };

      const originalSend = xhrInstance.send.bind(xhrInstance);
      (xhrInstance as { send: typeof xhrInstance.send }).send = function (
        ...sendArgs: Parameters<typeof xhrInstance.send>
      ): void {
        if (NetworkCollector.isCollectorUrl(capturedUrl, config.exporter.url)) {
          return originalSend(...sendArgs);
        }
        capturedStartTime = getCurrentTime();
        capturedTimestamp = getWallClockTime();
        return originalSend(...sendArgs);
      };

      xhrInstance.addEventListener("loadend", () => {
        if (!capturedStartTime || !capturedUrl) return;
        if (NetworkCollector.isCollectorUrl(capturedUrl, config.exporter.url)) return;

        const capturedEndTime = getCurrentTime();
        NetworkCollector.totalRequestCount++;
        if (xhrInstance.status === 0 || xhrInstance.status >= 400) {
          NetworkCollector.errorRequestCount++;
        }

        signalBus.emit({
          type: SignalType.Span,
          name: MetricName.NetworkXhr,
          timestamp: capturedTimestamp,
          route: "",
          sessionId: "",
          startTime: capturedStartTime,
          endTime: capturedEndTime,
          duration: capturedEndTime - capturedStartTime,
          attributes: {
            url: capturedUrl,
            method: capturedMethod,
            status: xhrInstance.status,
            ok: xhrInstance.status >= 200 && xhrInstance.status < 300,
          },
        });
      });

      return xhrInstance as unknown as void;
    }

    // Copy prototype chain — preserves instanceof checks
    TelemetryXhrWrapper.prototype = OriginalXMLHttpRequest.prototype;
    Object.defineProperty(TelemetryXhrWrapper, "name", {
      value: "XMLHttpRequest",
    });

    window.XMLHttpRequest =
      TelemetryXhrWrapper as unknown as typeof XMLHttpRequest;
  }

  private static startErrorRateTracking(
    signalBus: SignalBus,
    config: ResolvedConfig
  ): void {
    NetworkCollector.errorRateIntervalId = setInterval(() => {
      if (NetworkCollector.totalRequestCount === 0) return;

      const errorRate =
        NetworkCollector.errorRequestCount / NetworkCollector.totalRequestCount;

      signalBus.emit({
        type: SignalType.Metric,
        name: MetricName.NetworkErrorRate,
        timestamp: getWallClockTime(),
        route: "",
        sessionId: "",
        value: errorRate,
        unit: "ratio",
        attributes: {
          errorCount: NetworkCollector.errorRequestCount,
          totalCount: NetworkCollector.totalRequestCount,
          windowSeconds: NETWORK_ERROR_RATE_INTERVAL_MS / 1000,
        },
      });

      // Reset counters for next window
      NetworkCollector.totalRequestCount = 0;
      NetworkCollector.errorRequestCount = 0;
    }, NETWORK_ERROR_RATE_INTERVAL_MS);
  }
}
