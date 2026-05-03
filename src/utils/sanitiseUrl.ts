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
 * Compiled URL sanitisation pattern — applied in a single pass.
 *
 * Optimisation: O(n) single pass replacing O(5n) five sequential passes.
 * Matches in priority order:
 *   1. Query string and fragment — removed entirely
 *   2. UUID-like patterns in paths — replaced with :uuid
 *   3. Numeric ID segments in paths — replaced with /:id
 *
 * See docs/optimisations.md entry #6 for details.
 */
const URL_SANITISE_PATTERN =
  /[?#].*$|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\/\d+(?=\/|$)/gi;

/**
 * Sanitises a URL for telemetry recording.
 * Strips query params and fragments (default), replaces UUIDs and numeric IDs
 * with canonical placeholders for consistent grouping across builds.
 *
 * @param rawUrl - The original URL to sanitise
 * @param stripQueryParams - Whether to remove query string and fragment — default true
 */
export const sanitiseUrl = (
  rawUrl: string,
  stripQueryParams = true
): string => {
  if (!rawUrl) return "";

  return rawUrl.replace(URL_SANITISE_PATTERN, (matchedToken) => {
    // Query string or fragment — remove entirely if stripping is enabled
    if (
      stripQueryParams &&
      (matchedToken.startsWith("?") || matchedToken.startsWith("#"))
    ) {
      return "";
    }
    // Not stripping but matched query/fragment — keep as-is
    if (matchedToken.startsWith("?") || matchedToken.startsWith("#")) {
      return matchedToken;
    }
    // UUID pattern — replace with readable placeholder
    if (matchedToken.includes("-")) {
      return ":uuid";
    }
    // Numeric ID segment — replace with :id
    return "/:id";
  });
};

/**
 * Escapes all RegExp special characters in a string.
 * Used to safely compile developer-provided URL patterns into a combined RegExp.
 * Prevents catastrophic backtracking from user-provided patterns.
 */
export const escapeRegexCharacters = (rawPattern: string): string => {
  return rawPattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Compiles an array of URL pattern strings into a single combined RegExp.
 * All patterns are escaped — they are treated as literal substrings, not regex.
 * Returns null if the patterns array is empty.
 *
 * Optimisation: O(1) per URL check regardless of pattern count.
 * See docs/optimisations.md entry #2 for details.
 */
export const compileUrlIgnorePatterns = (
  urlPatterns: ReadonlyArray<string>
): RegExp | null => {
  const validPatterns = urlPatterns.filter(
    (pattern) => typeof pattern === "string" && pattern.length > 0
  );
  if (validPatterns.length === 0) return null;
  return new RegExp(validPatterns.map(escapeRegexCharacters).join("|"));
};
