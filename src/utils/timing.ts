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

/**
 * Returns a high-resolution relative timestamp in milliseconds.
 * Falls back to Date.now() if performance.now() is unavailable.
 * Use for measuring durations — not for wall clock time.
 */
export const getCurrentTime = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
};

/**
 * Returns the current wall clock time in milliseconds.
 * Always uses Date.now() — for absolute timestamps in events.
 */
export const getWallClockTime = (): number => Date.now();

/**
 * Generates a UUID v4 string.
 * Uses crypto.randomUUID() when available (HTTPS contexts, modern browsers).
 * Falls back to a Math.random()-based RFC 4122 compliant implementation.
 */
export const generateUUID = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  // RFC 4122 compliant UUID v4 fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const randomValue = (Math.random() * 16) | 0;
      const uuidValue =
        character === "x" ? randomValue : (randomValue & 0x3) | 0x8;
      return uuidValue.toString(16);
    }
  );
};

/**
 * Generates a 32-character hex string for OTel trace IDs (128-bit).
 */
export const generateTraceId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const byteArray = new Uint8Array(16);
    crypto.getRandomValues(byteArray);
    return Array.from(byteArray)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback — less cryptographically secure
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
};

/**
 * Generates a 16-character hex string for OTel span IDs (64-bit).
 */
export const generateSpanId = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const byteArray = new Uint8Array(8);
    crypto.getRandomValues(byteArray);
    return Array.from(byteArray)
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback — less cryptographically secure
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
};

/**
 * Schedules a microtask using queueMicrotask when available.
 * Falls back to Promise.resolve().then() for older environments.
 */
export const scheduleMicrotask = (callbackFunction: () => void): void => {
  if (typeof queueMicrotask === "function") {
    queueMicrotask(callbackFunction);
  } else {
    Promise.resolve().then(callbackFunction);
  }
};
