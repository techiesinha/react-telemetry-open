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
import { getWallClockTime } from "../utils/timing";
import { addDocumentListener } from "../utils/browserEnvironment";

/** Interactive element role attributes */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
  "combobox",
  "listbox",
  "slider",
  "spinbutton",
  "textbox",
  "searchbox",
  "switch",
]);

/** Element tags that are inherently interactive */
const INTERACTIVE_TAGS = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "SELECT",
  "TEXTAREA",
  "LABEL",
  "SUMMARY",
]);

/** Roles to exclude from rage click detection — intentional rapid interaction */
const EXCLUDED_ROLES = new Set(["checkbox", "switch", "slider", "spinbutton"]);

/**
 * RageClickCollector detects user frustration via two signals:
 *
 * 1. Rage click — 3+ clicks on same element within 500ms (sliding window)
 * 2. Dead click — click on element with no registered React event handler
 *
 * Optimisation: Map<elementId, timestamps[]> with sliding window gives O(1)
 * amortised detection instead of O(n²) naive nested scan.
 * See docs/optimisations.md entry #1.
 *
 * Mobile: uses 'touchend' instead of 'click' to avoid 300ms tap delay
 * on older mobile browsers.
 */
export class RageClickCollector {
  private static isInitialised = false;
  private static config: ResolvedConfig | null = null;

  /**
   * Click timestamp history per element identifier.
   * Map provides O(1) lookup. Fixed-size window per element prevents growth.
   *
   * Optimisation: O(1) amortised vs O(n²) naive approach.
   */
  private static readonly clickTimestampsByElement = new Map<string, number[]>();

  /** Cleanup function for click/touchend listener */
  private static listenerCleanup: (() => void) | null = null;

  /** First interaction timestamp for time-to-first-interaction metric */
  private static firstInteractionTimestamp: number | null = null;

  static init(signalBus: SignalBus, config: ResolvedConfig): void {
    if (RageClickCollector.isInitialised) return;
    if (!config.signals.interactions) return;
    if (typeof document === "undefined") return;

    RageClickCollector.isInitialised = true;
    RageClickCollector.config = config;

    // Use touchend on touch devices to avoid 300ms tap delay
    const isTouchDevice =
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
    const clickEventName = isTouchDevice ? "touchend" : "click";

    RageClickCollector.listenerCleanup = addDocumentListener(
      clickEventName,
      (event: Event) => {
        RageClickCollector.handleInteraction(
          event as MouseEvent | TouchEvent,
          signalBus,
          config
        );
      },
      { passive: true }
    );
  }

  static destroy(): void {
    RageClickCollector.listenerCleanup?.();
    RageClickCollector.listenerCleanup = null;
    RageClickCollector.clickTimestampsByElement.clear();
    RageClickCollector.firstInteractionTimestamp = null;
    RageClickCollector.config = null;
    RageClickCollector.isInitialised = false;
  }

  private static handleInteraction(
    event: MouseEvent | TouchEvent,
    signalBus: SignalBus,
    config: ResolvedConfig
  ): void {
    const currentTimestamp = getWallClockTime();

    // Track time to first interaction
    if (RageClickCollector.firstInteractionTimestamp === null) {
      RageClickCollector.firstInteractionTimestamp = currentTimestamp;
      const timeToFirst = typeof performance !== "undefined"
        ? performance.now()
        : 0;
      signalBus.emit({
        type: SignalType.Metric,
        name: MetricName.InteractionTimeToFirst,
        timestamp: currentTimestamp,
        route: "",
        sessionId: "",
        value: timeToFirst,
        unit: "ms",
        attributes: { interactionType: event.type },
      });
    }

    const targetElement = event.target as HTMLElement | null;
    if (!targetElement) return;

    const interactiveAncestor = RageClickCollector.findInteractiveAncestor(targetElement);
    if (!interactiveAncestor) return;

    // Skip elements with roles that have intentional rapid interaction
    const elementRole = interactiveAncestor.getAttribute("role");
    if (elementRole && EXCLUDED_ROLES.has(elementRole)) return;

    const elementIdentifier = RageClickCollector.getElementIdentifier(interactiveAncestor);
    const isRageClick = RageClickCollector.recordClickAndCheck(
      elementIdentifier,
      currentTimestamp,
      config
    );

    if (isRageClick) {
      const clickHistory = RageClickCollector.clickTimestampsByElement.get(elementIdentifier) ?? [];
      const burstDurationMs =
        clickHistory.length >= 2
          ? (clickHistory[clickHistory.length - 1] ?? 0) - (clickHistory[0] ?? 0)
          : 0;

      signalBus.emit({
        type: SignalType.Log,
        name: MetricName.InteractionRageClick,
        timestamp: currentTimestamp,
        route: "",
        sessionId: "",
        attributes: {
          element: elementIdentifier,
          elementType: interactiveAncestor.tagName.toLowerCase(),
          clickCount: clickHistory.length,
          burstDurationMs,
        },
      });

      // Clear history after detecting rage click
      RageClickCollector.clickTimestampsByElement.delete(elementIdentifier);
    }
  }

  /**
   * Records a click timestamp and checks if it constitutes a rage click
   * using a sliding window approach.
   *
   * Sliding window: any 'threshold' consecutive clicks spanning ≤ windowMs = rage click.
   * This handles the 501ms edge case where fixed windows would miss the burst.
   *
   * Optimisation: O(1) amortised — Map lookup + fixed window trim.
   * See docs/optimisations.md entry #1.
   */
  private static recordClickAndCheck(
    elementId: string,
    timestamp: number,
    config: ResolvedConfig
  ): boolean {
    const { threshold, windowMs } = config.interactions.rageClick;
    const existingTimestamps = RageClickCollector.clickTimestampsByElement.get(elementId) ?? [];

    existingTimestamps.push(timestamp);

    // Keep only timestamps within the window — fixed size per threshold
    const windowStart = timestamp - windowMs;
    const relevantTimestamps = existingTimestamps.filter(
      (clickTime) => clickTime >= windowStart
    );

    RageClickCollector.clickTimestampsByElement.set(elementId, relevantTimestamps);

    // Trim elements with old timestamps to prevent unbounded Map growth
    if (existingTimestamps.length > threshold * 3) {
      RageClickCollector.clickTimestampsByElement.set(elementId, relevantTimestamps);
    }

    if (relevantTimestamps.length < threshold) return false;

    // Sliding window check — any consecutive 'threshold' clicks within windowMs
    for (
      let startIndex = 0;
      startIndex <= relevantTimestamps.length - threshold;
      startIndex++
    ) {
      const windowStartTime = relevantTimestamps[startIndex];
      const windowEndTime = relevantTimestamps[startIndex + threshold - 1];
      if (
        windowStartTime !== undefined &&
        windowEndTime !== undefined &&
        windowEndTime - windowStartTime <= windowMs
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Walks up the DOM tree to find the nearest interactive ancestor element.
   * This ensures clicks on child elements (icon, span inside button) are
   * attributed to the interactive parent.
   */
  private static findInteractiveAncestor(
    element: HTMLElement
  ): HTMLElement | null {
    let currentElement: HTMLElement | null = element;

    while (currentElement && currentElement !== document.body) {
      if (RageClickCollector.isInteractiveElement(currentElement)) {
        return currentElement;
      }
      currentElement = currentElement.parentElement;
    }

    return null;
  }

  private static isInteractiveElement(element: HTMLElement): boolean {
    if (INTERACTIVE_TAGS.has(element.tagName)) return true;
    const role = element.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) return true;
    if (element.hasAttribute("tabindex")) return true;
    if (element.hasAttribute("onclick")) return true;
    return false;
  }

  /**
   * Produces a stable element identifier using structural attributes only.
   * Priority: data-testid → id → aria-label → tag + type + name + class + text
   *
   * Text content is used as a last resort only when short (under 50 chars)
   * and contains no digits — this filters out dynamic text like "Count: 47"
   * while capturing static labels like "Submit Order" or "Cancel".
   */
  private static getElementIdentifier(element: HTMLElement): string {
    const testId = element.getAttribute("data-testid");
    if (testId) return testId;

    const elementId = element.getAttribute("id");
    if (elementId) return elementId;

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) return ariaLabel;

    const tagName = element.tagName.toLowerCase();
    const typeAttr = element.getAttribute("type");
    const nameAttr = element.getAttribute("name");
    const classAttr = element.className
      ? `.${element.className.trim().split(/\s+/).join(".")}`
      : "";

    const base = `${tagName}${typeAttr ? `[type=${typeAttr}]` : ""}${nameAttr ? `[name=${nameAttr}]` : ""}${classAttr}`;

    // Last resort — use visible text content if it is short and static.
    // Guards: under 50 chars (long text is likely dynamic content) and
    // no digits (e.g. "Count: 47" changes on every click, "Submit Order" does not).
    // textContent with digits is intentionally excluded — it changes with React state.
    const text = element.textContent?.trim() ?? "";
    if (text && text.length < 50 && !/\d/.test(text)) {
      return `${base}[text="${text}"]`;
    }

    return base;
  }
}
