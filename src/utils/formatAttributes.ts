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

import type { AttributeMap } from "../types/internal";

/** OTLP typed attribute value as required by the OTLP/HTTP JSON specification */
export type OtlpAttributeValue =
  | { stringValue: string }
  | { intValue: number }
  | { doubleValue: number }
  | { boolValue: boolean };

/** OTLP key-value attribute pair */
export interface OtlpAttribute {
  readonly key: string;
  readonly value: OtlpAttributeValue;
}

/**
 * Formats a single attribute value into OTLP typed format.
 * Null values are excluded — call site should check before invoking.
 */
const formatAttributeValue = (
  attributeValue: string | number | boolean
): OtlpAttributeValue => {
  if (typeof attributeValue === "string") {
    return { stringValue: attributeValue };
  }
  if (typeof attributeValue === "boolean") {
    return { boolValue: attributeValue };
  }
  if (Number.isInteger(attributeValue)) {
    return { intValue: attributeValue };
  }
  return { doubleValue: attributeValue };
};

/**
 * Converts an attribute map to an array of OTLP-typed attribute pairs.
 *
 * Optimisation: O(n) single pass with for...of instead of O(2n) via
 * Object.entries() + Array.map(). Null values skipped inline.
 * See docs/optimisations.md entry #7 for details.
 */
export const formatAttributes = (
  attributeMap: AttributeMap
): OtlpAttribute[] => {
  const formattedAttributes: OtlpAttribute[] = [];

  for (const [attributeKey, attributeValue] of Object.entries(attributeMap)) {
    if (attributeValue === null) continue; // skip null — not representable in OTLP
    formattedAttributes.push({
      key: attributeKey,
      value: formatAttributeValue(attributeValue),
    });
  }

  return formattedAttributes;
};
