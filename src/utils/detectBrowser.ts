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

import type { BrowserContext, DeviceContext, OsContext } from "../types/internal";
import { DeviceType } from "../types/internal";

/** Detected browser information */
export interface DetectedBrowser {
  readonly name: string;
  readonly version: string;
  readonly engine: string;
  readonly language: string;
}

/** Detected OS information */
export interface DetectedOs {
  readonly name: string;
  readonly version: string | null;
}

/**
 * Detects browser name, version, and rendering engine.
 * Prefers the modern navigator.userAgentData API (Chrome/Edge).
 * Falls back to userAgent string parsing for other browsers.
 */
export const detectBrowser = (): BrowserContext => {
  if (typeof navigator === "undefined") {
    return { name: "unknown", version: "unknown", engine: "unknown", language: "unknown" };
  }

  const language = navigator.language ?? "unknown";

  // Modern API — available in Chrome and Edge
  if ("userAgentData" in navigator && navigator.userAgentData) {
    const uaData = navigator.userAgentData as {
      brands?: Array<{ brand: string; version: string }>;
      platform?: string;
    };
    const chromeBrand = uaData.brands?.find(
      (brand) => brand.brand === "Google Chrome" || brand.brand === "Chromium"
    );
    const edgeBrand = uaData.brands?.find((brand) =>
      brand.brand.includes("Edge")
    );
    const activeBrand = edgeBrand ?? chromeBrand;

    if (activeBrand) {
      return {
        name: edgeBrand ? "Edge" : "Chrome",
        version: activeBrand.version,
        engine: "Blink",
        language,
      };
    }
  }

  // Fallback — userAgent string parsing
  const userAgent = navigator.userAgent;

  if (userAgent.includes("Firefox")) {
    const versionMatch = userAgent.match(/Firefox\/(\d+)/);
    return {
      name: "Firefox",
      version: versionMatch?.[1] ?? "unknown",
      engine: "Gecko",
      language,
    };
  }

  if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    const versionMatch = userAgent.match(/Version\/(\d+)/);
    return {
      name: "Safari",
      version: versionMatch?.[1] ?? "unknown",
      engine: "WebKit",
      language,
    };
  }

  if (userAgent.includes("Edg/")) {
    const versionMatch = userAgent.match(/Edg\/(\d+)/);
    return {
      name: "Edge",
      version: versionMatch?.[1] ?? "unknown",
      engine: "Blink",
      language,
    };
  }

  if (userAgent.includes("Chrome")) {
    const versionMatch = userAgent.match(/Chrome\/(\d+)/);
    return {
      name: "Chrome",
      version: versionMatch?.[1] ?? "unknown",
      engine: "Blink",
      language,
    };
  }

  return { name: "unknown", version: "unknown", engine: "unknown", language };
};

/**
 * Detects the operating system name and version from userAgent.
 */
export const detectOs = (): OsContext => {
  if (typeof navigator === "undefined") {
    return { name: "unknown", version: null };
  }

  const userAgent = navigator.userAgent;

  if (userAgent.includes("iPhone") || userAgent.includes("iPad")) {
    const versionMatch = userAgent.match(/OS (\d+_\d+)/);
    return {
      name: "iOS",
      version: versionMatch?.[1]?.replace("_", ".") ?? null,
    };
  }

  if (userAgent.includes("Android")) {
    const versionMatch = userAgent.match(/Android (\d+\.?\d*)/);
    return { name: "Android", version: versionMatch?.[1] ?? null };
  }

  if (userAgent.includes("Windows")) {
    const versionMatch = userAgent.match(/Windows NT (\d+\.\d+)/);
    return { name: "Windows", version: versionMatch?.[1] ?? null };
  }

  if (userAgent.includes("Mac OS X")) {
    const versionMatch = userAgent.match(/Mac OS X (\d+[._]\d+)/);
    return {
      name: "macOS",
      version: versionMatch?.[1]?.replace("_", ".") ?? null,
    };
  }

  if (userAgent.includes("Linux")) {
    return { name: "Linux", version: null };
  }

  return { name: "unknown", version: null };
};

/**
 * Detects device type from viewport dimensions and touch capability.
 */
export const detectDeviceType = (): DeviceContext["type"] => {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return DeviceType.Desktop;
  }

  const hasTouchCapability = navigator.maxTouchPoints > 0;
  const viewportWidth = window.innerWidth;

  if (hasTouchCapability && viewportWidth < 768) return DeviceType.Mobile;
  if (hasTouchCapability && viewportWidth < 1024) return DeviceType.Tablet;
  return DeviceType.Desktop;
};
