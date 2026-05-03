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
 * Google Core Web Vitals thresholds.
 *
 * Source: https://web.dev/vitals/
 * These are the official thresholds used by Google Lighthouse, Chrome DevTools,
 * and the Chrome UX Report. Any rating produced by this package matches exactly
 * what Google's tooling reports for the same metric value.
 *
 * Do not change these values — they are not configurable opinions,
 * they are the published specification.
 */

/** LCP good threshold in milliseconds */
export const LCP_GOOD_THRESHOLD_MS = 2_500;

/** LCP poor threshold in milliseconds — above this is poor */
export const LCP_POOR_THRESHOLD_MS = 4_000;

/** FCP good threshold in milliseconds */
export const FCP_GOOD_THRESHOLD_MS = 1_800;

/** FCP poor threshold in milliseconds */
export const FCP_POOR_THRESHOLD_MS = 3_000;

/** FID good threshold in milliseconds */
export const FID_GOOD_THRESHOLD_MS = 100;

/** FID poor threshold in milliseconds */
export const FID_POOR_THRESHOLD_MS = 300;

/** CLS good threshold — unitless score */
export const CLS_GOOD_THRESHOLD = 0.1;

/** CLS poor threshold — unitless score */
export const CLS_POOR_THRESHOLD = 0.25;

/** INP good threshold in milliseconds */
export const INP_GOOD_THRESHOLD_MS = 200;

/** INP poor threshold in milliseconds */
export const INP_POOR_THRESHOLD_MS = 500;
