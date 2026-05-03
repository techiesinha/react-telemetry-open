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

import type {
  BrowserContext,
  DeviceContext,
  NetworkContext,
  OsContext,
  SessionSnapshot,
} from "../types/internal";
import { Locale } from "../locale";
import { generateUUID, getCurrentTime, getWallClockTime } from "../utils/timing";
import { detectBrowser, detectOs, detectDeviceType } from "../utils/detectBrowser";
import { detectRouter } from "../utils/detectRouter";
import { addDocumentListener, addWindowListener } from "../utils/browserEnvironment";
import {
  SESSION_EXPIRY_MS,
  SESSION_INACTIVITY_CHECK_INTERVAL_MS,
} from "../constants";

/**
 * SessionManager captures one-time device/browser metadata at session start
 * and manages the session lifecycle including inactivity expiry.
 *
 * Session definition: a continuous period of user engagement, expiring after
 * 30 minutes of inactivity. Each browser tab is an independent session.
 *
 * All metadata is captured synchronously at init() — under 2ms total.
 * The session ID and stable context are immutable after creation.
 */
export class SessionManager {
  private sessionId: string;
  private readonly sessionStartTime: number;
  private pageViewCount: number = 0;

  /** Timestamp of last recorded user activity — used for inactivity check */
  private lastActivityTimestamp: number;

  /** Whether the browser tab is currently visible */
  private isTabVisible: boolean = true;

  /** Interval for periodic inactivity check — stored for cleanup */
  private inactivityCheckIntervalId: ReturnType<typeof setInterval> | null = null;

  /** Stable device context — captured once, never changes */
  private readonly deviceContext: DeviceContext;

  /** Stable browser context — captured once, never changes */
  private readonly browserContext: BrowserContext;

  /** Stable OS context — captured once, never changes */
  private readonly osContext: OsContext;

  /** Network context — can update on connection change events */
  private networkContext: NetworkContext;

  /** Cleanup functions for event listeners */
  private readonly listenerCleanupFunctions: Array<() => void> = [];

  private readonly debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.debugEnabled = debugEnabled;
    this.sessionId = generateUUID();
    this.sessionStartTime = getWallClockTime();
    this.lastActivityTimestamp = this.sessionStartTime;

    // Capture stable metadata synchronously — under 2ms total
    this.deviceContext = this.captureDeviceContext();
    this.browserContext = detectBrowser();
    this.osContext = detectOs();
    this.networkContext = this.captureNetworkContext();

    this.setupActivityTracking();
    this.setupVisibilityTracking();
    this.setupConnectionTracking();
    this.startInactivityCheck();
  }

  /** Returns the current session snapshot for event enrichment */
  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId,
      sessionStartTime: this.sessionStartTime,
      pageViews: this.pageViewCount,
      device: this.deviceContext,
      browser: this.browserContext,
      os: this.osContext,
      network: { ...this.networkContext, online: typeof navigator !== "undefined" ? navigator.onLine : true },
      routerType: detectRouter(),
    };
  }

  /** Returns current session duration in milliseconds */
  getSessionDuration(): number {
    return getWallClockTime() - this.sessionStartTime;
  }

  /** Increments page view counter — called by route tracking */
  incrementPageViews(): void {
    this.pageViewCount++;
  }

  /** Cleans up all event listeners and intervals */
  destroy(): void {
    if (this.inactivityCheckIntervalId !== null) {
      clearInterval(this.inactivityCheckIntervalId);
      this.inactivityCheckIntervalId = null;
    }
    for (const cleanupFunction of this.listenerCleanupFunctions) {
      cleanupFunction();
    }
    this.listenerCleanupFunctions.length = 0;
  }

  private captureDeviceContext(): DeviceContext {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      return {
        memory: null,
        cpuCores: 1,
        type: "desktop",
        viewport: { width: 0, height: 0, dpr: 1 },
        touchEnabled: false,
      };
    }

    return {
      // navigator.deviceMemory is Chrome/Edge only — optional chaining
      memory: (navigator as { deviceMemory?: number }).deviceMemory ?? null,
      cpuCores: navigator.hardwareConcurrency ?? 1,
      type: detectDeviceType(),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio ?? 1,
      },
      touchEnabled: navigator.maxTouchPoints > 0,
    };
  }

  private captureNetworkContext(): NetworkContext {
    if (typeof navigator === "undefined") {
      return { type: "unknown", downlink: null, rtt: null, saveData: false, online: true };
    }

    // navigator.connection is Chrome/Edge only — use optional chaining throughout
    const browserConnection =
      (navigator as {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
        mozConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
        webkitConnection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
      }).connection ??
      (navigator as { mozConnection?: object }).mozConnection ??
      (navigator as { webkitConnection?: object }).webkitConnection ??
      null;

    return {
      type: (browserConnection as { effectiveType?: string } | null)?.effectiveType ?? "unknown",
      downlink: (browserConnection as { downlink?: number } | null)?.downlink ?? null,
      rtt: (browserConnection as { rtt?: number } | null)?.rtt ?? null,
      saveData: (browserConnection as { saveData?: boolean } | null)?.saveData ?? false,
      online: navigator.onLine,
    };
  }

  /**
   * Records user activity via timestamp assignment — O(1), no timer operations.
   *
   * Optimisation: timestamp recording instead of clearTimeout+setTimeout per event.
   * At 60fps scroll events: 1 assignment vs 120 timer operations per second.
   * See docs/optimisations.md entry #10.
   */
  private recordActivity(): void {
    this.lastActivityTimestamp = getWallClockTime();
  }

  /**
   * Starts periodic inactivity check instead of resetting timer on every event.
   * Checks every SESSION_INACTIVITY_CHECK_INTERVAL_MS rather than per interaction.
   */
  private startInactivityCheck(): void {
    this.inactivityCheckIntervalId = setInterval(() => {
      if (!this.isTabVisible) return; // pause check when tab is hidden

      const timeSinceLastActivity = getWallClockTime() - this.lastActivityTimestamp;
      if (timeSinceLastActivity >= SESSION_EXPIRY_MS) {
        this.expireSession();
      }
    }, SESSION_INACTIVITY_CHECK_INTERVAL_MS);
  }

  private expireSession(): void {
    this.sessionId = generateUUID();
    this.lastActivityTimestamp = getWallClockTime();
    this.pageViewCount = 0;
  }

  private setupActivityTracking(): void {
    const handleActivity = () => this.recordActivity();

    this.listenerCleanupFunctions.push(
      addDocumentListener("click", handleActivity),
      addDocumentListener("keypress", handleActivity),
      addDocumentListener("scroll", handleActivity, { passive: true }),
      addDocumentListener("touchstart", handleActivity, { passive: true })
    );
  }

  private setupVisibilityTracking(): void {
    const handleVisibilityChange = () => {
      this.isTabVisible = document.visibilityState === "visible";
      if (this.isTabVisible) {
        // Resume activity tracking when tab becomes visible again
        this.recordActivity();
      }
    };

    this.listenerCleanupFunctions.push(
      addDocumentListener("visibilitychange", handleVisibilityChange)
    );
  }

  private setupConnectionTracking(): void {
    const browserConnection = (navigator as {
      connection?: EventTarget;
    }).connection;

    if (!browserConnection) return;

    const handleConnectionChange = () => {
      this.networkContext = this.captureNetworkContext();
    };

    browserConnection.addEventListener("change", handleConnectionChange);
    this.listenerCleanupFunctions.push(() => {
      browserConnection.removeEventListener("change", handleConnectionChange);
    });
  }
}
