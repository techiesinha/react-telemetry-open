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

/** Default number of events to accumulate before flushing to exporter */
export const DEFAULT_BATCH_SIZE = 50;

/** Default interval between batch flushes in milliseconds */
export const DEFAULT_FLUSH_INTERVAL_MS = 5_000;

/** Default maximum number of events held in the export queue */
export const DEFAULT_MAX_QUEUE_SIZE = 500;

/** Maximum events held in the pre-boot buffer before Pipeline is ready */
export const PRE_BOOT_BUFFER_MAX_SIZE = 20;

/** Default sampling rate — record all events */
export const DEFAULT_SAMPLING_RATE = 1.0;

/** Maximum allowed sampling rate */
export const MAX_SAMPLING_RATE = 1.0;

/** Minimum allowed sampling rate */
export const MIN_SAMPLING_RATE = 0.0;

/** Minimum allowed batch size */
export const MIN_BATCH_SIZE = 1;

/** Maximum allowed batch size */
export const MAX_BATCH_SIZE = 1_000;

/** Minimum allowed flush interval in milliseconds */
export const MIN_FLUSH_INTERVAL_MS = 1_000;

/** Maximum allowed flush interval in milliseconds */
export const MAX_FLUSH_INTERVAL_MS = 60_000;

/** Minimum allowed queue size */
export const MIN_MAX_QUEUE_SIZE = 50;

/** Maximum allowed queue size */
export const MAX_MAX_QUEUE_SIZE = 2_000;

/** Minimum allowed input debounce in milliseconds */
export const MIN_INPUT_DEBOUNCE_MS = 0;

/** Maximum allowed input debounce in milliseconds */
export const MAX_INPUT_DEBOUNCE_MS = 5_000;

/** Minimum rage click threshold */
export const MIN_RAGE_CLICK_THRESHOLD = 2;

/** Maximum rage click threshold */
export const MAX_RAGE_CLICK_THRESHOLD = 10;

/** Minimum rage click window in milliseconds */
export const MIN_RAGE_CLICK_WINDOW_MS = 200;

/** Maximum rage click window in milliseconds */
export const MAX_RAGE_CLICK_WINDOW_MS = 2_000;

/** Maximum app name length in characters */
export const MAX_APP_NAME_LENGTH = 128;

/** Default maximum custom event properties payload size in bytes */
export const DEFAULT_MAX_PROPERTIES_SIZE_BYTES = 4_096;

/** Absolute maximum custom event properties payload size in bytes */
export const ABSOLUTE_MAX_PROPERTIES_SIZE_BYTES = 65_536;

/** Maximum number of retry attempts for failed exports */
export const MAX_EXPORT_RETRY_ATTEMPTS = 5;

/** Base delay for exponential backoff in milliseconds */
export const EXPORT_RETRY_BASE_DELAY_MS = 1_000;

/** Maximum delay between export retries in milliseconds */
export const EXPORT_RETRY_MAX_DELAY_MS = 30_000;

/** Number of consecutive failures to open the circuit breaker */
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 5;

/** Duration circuit breaker stays open before testing in milliseconds */
export const CIRCUIT_BREAKER_RESET_TIMEOUT_MS = 60_000;

/** Sampling rate applied when user has data saver enabled */
export const SAVE_DATA_SAMPLING_RATE = 0.01;

/** Flush interval applied when user has data saver enabled */
export const SAVE_DATA_FLUSH_INTERVAL_MS = 60_000;

/** Maximum concurrent in-flight export requests */
export const MAX_CONCURRENT_EXPORTS = 3;

/** Minimum memory threshold in bytes — readings below this are skipped */
export const MIN_VALID_HEAP_SIZE_BYTES = 1;

/** Retry delay after malformed config file before re-reading in milliseconds */
export const CONFIG_RETRY_DELAY_MS = 100;

/** Number of characters from error stack to use for deduplication signature */
export const ERROR_DEDUP_STACK_CHARS = 100;

/**
 * Package version placeholder — replaced at build time by tsup with the
 * actual version from package.json via process.env.npm_package_version.
 * If you see this string in production events, the build was not run via npm.
 */
export const PACKAGE_VERSION = "__PACKAGE_VERSION__";
