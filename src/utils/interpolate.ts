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
 * Replaces {placeholder} tokens in a locale string with provided values.
 *
 * @example
 * interpolate("Attempt {attempt} of {max}", { attempt: 2, max: 5 })
 * // → "Attempt 2 of 5"
 */
export const interpolate = (
  template: string,
  values: Record<string, string | number>
): string => {
  return Object.entries(values).reduce(
    (result, [placeholderKey, placeholderValue]) =>
      result.replace(`{${placeholderKey}}`, String(placeholderValue)),
    template
  );
};
