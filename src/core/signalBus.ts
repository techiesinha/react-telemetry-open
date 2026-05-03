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

import type { RawEvent } from "../types/internal";
import { Locale } from "../locale";
import { interpolate } from "../utils/interpolate";
import { MAX_SIGNAL_BUS_LISTENERS_PER_TYPE, PRE_BOOT_BUFFER_MAX_SIZE } from "../constants";
import { MetricName, SignalType } from "../types/internal";

export type SignalListener = (event: RawEvent) => void;
export type UnsubscribeFunction = () => void;

/**
 * SignalBus — the central event emitter for react-telemetry-open.
 *
 * Decouples signal producers (hooks, collectors) from signal consumers (Pipeline).
 * Supports wildcard subscription for the Pipeline and type-specific subscriptions
 * for specialised consumers like LongTaskCollector.
 *
 * Features:
 * - Pre-boot buffer captures events before Pipeline is ready
 * - Listener snapshots prevent infinite loops from re-entrant emit
 * - Try-catch per listener ensures one failing listener never affects others
 * - isDestroyed flag prevents post-cleanup emits from crashing
 * - Set-based listener storage provides O(1) duplicate detection
 */
export class SignalBus {
  /** Set-based listener storage — O(1) duplicate detection per listener addition */
  private readonly listenerSets = new Map<string, Set<SignalListener>>();

  /** Pre-boot buffer — captures events before Pipeline subscribes */
  private preBootBuffer: RawEvent[] = [];

  /** Whether the Pipeline has connected and buffer should be flushed */
  private isPipelineConnected = false;

  /** Whether destroy() has been called — prevents post-cleanup emits */
  private isDestroyed = false;

  private readonly debugEnabled: boolean;

  constructor(debugEnabled = false) {
    this.debugEnabled = debugEnabled;
  }

  /**
   * Emits an event to all registered listeners.
   *
   * If Pipeline is not yet connected — event is stored in pre-boot buffer.
   * Listeners are snapshotted before iteration to prevent infinite loops
   * from re-entrant emissions (e.g. a listener that emits during its execution).
   */
  emit(event: RawEvent): void {
    if (this.isDestroyed) {
      if (this.debugEnabled) {
        console.warn(Locale.signalBus.emitAfterDestroy);
      }
      return;
    }

    if (!this.isPipelineConnected) {
      this.addToPreBootBuffer(event);
      return;
    }

    this.dispatchToListeners(event);
  }

  /**
   * Registers a listener for a specific event type or wildcard '*'.
   * Returns an unsubscribe function — call it to remove the listener.
   *
   * Optimisation: Set-based storage provides O(1) duplicate detection.
   * See docs/optimisations.md entry #5.
   */
  on(eventType: string, listener: SignalListener): UnsubscribeFunction {
    if (this.isDestroyed) return () => {};

    const existingListeners = this.listenerSets.get(eventType);

    if (
      existingListeners &&
      existingListeners.size >= MAX_SIGNAL_BUS_LISTENERS_PER_TYPE
    ) {
      if (this.debugEnabled) {
        console.warn(
          interpolate(Locale.signalBus.maxListenersExceeded, {
            max: MAX_SIGNAL_BUS_LISTENERS_PER_TYPE,
            eventType,
          })
        );
      }
      return () => {};
    }

    if (!this.listenerSets.has(eventType)) {
      this.listenerSets.set(eventType, new Set());
    }

    // Set.add() handles deduplication automatically — O(1)
    this.listenerSets.get(eventType)!.add(listener);

    return () => this.off(eventType, listener);
  }

  /**
   * Registers a listener that fires exactly once then automatically unsubscribes.
   */
  once(eventType: string, listener: SignalListener): UnsubscribeFunction {
    const wrappedListener: SignalListener = (event) => {
      unsubscribe();
      listener(event);
    };
    const unsubscribe = this.on(eventType, wrappedListener);
    return unsubscribe;
  }

  /**
   * Removes a specific listener for an event type.
   */
  off(eventType: string, listener: SignalListener): void {
    this.listenerSets.get(eventType)?.delete(listener);
  }

  /**
   * Called when Pipeline is ready to process events.
   * Flushes the pre-boot buffer through the Pipeline listener.
   */
  connectPipeline(pipelineListener: SignalListener): void {
    this.on("*", pipelineListener);
    this.isPipelineConnected = true;
    this.flushPreBootBuffer(pipelineListener);
  }

  /**
   * Removes all listeners and resets connection state.
   * Called by TelemetryProvider cleanup on unmount.
   * Does NOT set isDestroyed — the bus must be reconnectable after
   * React StrictMode's mount → unmount → remount cycle.
   */
  removeAllListeners(): void {
    this.listenerSets.clear();
    this.preBootBuffer = [];
    this.isPipelineConnected = false;
  }

  /**
   * Dispatches an event to all registered listeners.
   * Snapshots listener sets before iteration to prevent re-entrant emit loops.
   */
  private dispatchToListeners(event: RawEvent): void {
    // Snapshot wildcard listeners before iteration — prevents infinite loops
    const wildcardListenerSnapshot = [
      ...(this.listenerSets.get("*") ?? []),
    ];
    // Snapshot type-specific listeners
    const typeListenerSnapshot = [
      ...(this.listenerSets.get(event.type) ?? []),
    ];
    // Also dispatch to name-specific listeners (for LongTaskCollector correlation)
    const nameListenerSnapshot = [
      ...(this.listenerSets.get(event.name) ?? []),
    ];

    for (const listenerFunction of wildcardListenerSnapshot) {
      try {
        listenerFunction(event);
      } catch {
        // Listener threw — isolated, does not affect other listeners or app
      }
    }

    for (const listenerFunction of typeListenerSnapshot) {
      try {
        listenerFunction(event);
      } catch {
        // Isolated
      }
    }

    for (const listenerFunction of nameListenerSnapshot) {
      try {
        listenerFunction(event);
      } catch {
        // Isolated
      }
    }
  }

  /**
   * Adds an event to the pre-boot buffer.
   * Errors are prioritised — if buffer is full, oldest non-error event is dropped.
   */
  private addToPreBootBuffer(event: RawEvent): void {
    const isErrorEvent =
      event.type === SignalType.Log &&
      (event.name === MetricName.JsError ||
        event.name === MetricName.UnhandledRejection ||
        event.name === MetricName.ReactError);

    if (this.preBootBuffer.length < PRE_BOOT_BUFFER_MAX_SIZE) {
      this.preBootBuffer.push(event);
      return;
    }

    if (isErrorEvent) {
      // Buffer full but this is an error — drop oldest non-error event to make room
      const oldestNonErrorIndex = this.preBootBuffer.findIndex(
        (bufferedEvent) => bufferedEvent.type !== SignalType.Log
      );
      if (oldestNonErrorIndex !== -1) {
        this.preBootBuffer.splice(oldestNonErrorIndex, 1);
        this.preBootBuffer.push(event);
      }
      // If all buffered events are errors — drop the new event (all errors kept)
    }
    // Non-error event and buffer is full — drop silently
  }

  /**
   * Flushes all buffered pre-boot events to the Pipeline listener.
   * Uses direct indexed for loop for lower constant factor.
   *
   * Optimisation: indexed for loop vs forEach — avoids closure overhead.
   * See docs/optimisations.md entry #9.
   */
  private flushPreBootBuffer(pipelineListener: SignalListener): void {
    for (
      let bufferIndex = 0;
      bufferIndex < this.preBootBuffer.length;
      bufferIndex++
    ) {
      const bufferedEvent = this.preBootBuffer[bufferIndex];
      if (bufferedEvent) {
        try {
          pipelineListener(bufferedEvent);
        } catch {
          // Isolated
        }
      }
    }
    this.preBootBuffer = [];
  }
}
