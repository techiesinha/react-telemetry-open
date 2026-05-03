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
 * Internal error class used by react-telemetry-open.
 * The isTelemetryError flag allows ErrorCollector to identify
 * and suppress errors originating from our own package,
 * preventing infinite feedback loops.
 */
export class TelemetryError extends Error {
  readonly isTelemetryError = true as const;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "TelemetryError";
    if (cause instanceof Error) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }
  }
}

/**
 * Type guard to check if an error originated from react-telemetry-open.
 * Used in ErrorCollector to prevent tracking our own errors.
 */
export const isTelemetryError = (value: unknown): boolean => {
  return (
    value instanceof TelemetryError ||
    (typeof value === "object" &&
      value !== null &&
      "isTelemetryError" in value &&
      (value as { isTelemetryError: unknown }).isTelemetryError === true)
  );
};
