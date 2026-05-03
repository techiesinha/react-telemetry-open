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
 * Safely serialises a value to a JSON string.
 * Handles circular references and non-serialisable values without throwing.
 * Returns a fallback JSON string if serialisation fails.
 */
export const safeStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch {
    // Circular reference, BigInt, or other non-serialisable value
    return JSON.stringify({ serializationError: "Value could not be serialized" });
  }
};

/**
 * Safely parses a JSON string.
 * Returns null if parsing fails — never throws.
 */
export const safeParse = <ParsedType>(
  jsonString: string
): ParsedType | null => {
  try {
    // Strip UTF-8 BOM that some Windows editors add before JSON content
    const sanitisedString = jsonString.replace(/^\uFEFF/, "");
    return JSON.parse(sanitisedString) as ParsedType;
  } catch {
    return null;
  }
};
