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

import { Locale } from "../locale";
import { interpolate } from "./interpolate";

type PlainObject = Record<string, unknown>;

const isPlainObject = (value: unknown): value is PlainObject => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * Special array fields that are concatenated rather than replaced during merge.
 * All other arrays are replaced by the override value.
 */
const CONCATENATED_ARRAY_FIELDS = new Set(["components", "urls"]);

/**
 * Deep merges an override config object on top of a base config object.
 * Rules:
 *   - Nested objects are recursively merged
 *   - ignore.components and ignore.urls arrays are concatenated
 *   - All other arrays are replaced by the override value
 *   - Type mismatches: base type wins, override is ignored with a warning
 *   - Prototype properties are never merged (Object.hasOwn guard)
 *
 * Protection: Object.hasOwn() prevents prototype pollution attacks.
 */
export const deepMerge = (
  baseConfig: PlainObject,
  overrideConfig: PlainObject,
  debugEnabled = false,
  parentKey = ""
): PlainObject => {
  const mergedResult: PlainObject = { ...baseConfig };

  for (const propertyKey of Object.keys(overrideConfig)) {
    // Prototype pollution protection — skip inherited properties
    if (!Object.hasOwn(overrideConfig, propertyKey)) continue;

    const overrideValue = overrideConfig[propertyKey];
    const baseValue = baseConfig[propertyKey];
    const fullPropertyPath = parentKey
      ? `${parentKey}.${propertyKey}`
      : propertyKey;

    // Both are plain objects — recurse
    if (isPlainObject(overrideValue) && isPlainObject(baseValue)) {
      mergedResult[propertyKey] = deepMerge(
        baseValue,
        overrideValue,
        debugEnabled,
        fullPropertyPath
      );
      continue;
    }

    // Both are arrays — concatenate if in special list, otherwise replace
    if (Array.isArray(overrideValue) && Array.isArray(baseValue)) {
      if (CONCATENATED_ARRAY_FIELDS.has(propertyKey)) {
        mergedResult[propertyKey] = [...baseValue, ...overrideValue];
      } else {
        mergedResult[propertyKey] = overrideValue;
      }
      continue;
    }

    // Type mismatch between base and override — base type wins
    if (baseValue !== undefined && typeof baseValue !== typeof overrideValue) {
      if (debugEnabled) {
        console.warn(
          interpolate(Locale.config.typeMismatchInMerge, {
            field: fullPropertyPath,
            baseType: typeof baseValue,
            overrideType: typeof overrideValue,
          })
        );
      }
      // Keep base value — do not assign override
      continue;
    }

    // Safe to assign override value
    mergedResult[propertyKey] = overrideValue;
  }

  return mergedResult;
};
