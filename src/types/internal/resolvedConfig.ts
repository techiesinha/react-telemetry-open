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

import type { ExporterType } from "./domainTypes";

/**
 * Fully resolved configuration with all fields required.
 * Produced by ConfigManager after validation and default application.
 * This is a frozen object — never mutated after creation.
 * Every layer reads from this — no layer ever checks for missing fields.
 */
export interface ResolvedConfig {
  readonly app: ResolvedAppConfig;
  readonly exporter: ResolvedExporterConfig;
  readonly sampling: ResolvedSamplingConfig;
  readonly signals: ResolvedSignalsConfig;
  readonly batch: ResolvedBatchConfig;
  readonly privacy: ResolvedPrivacyConfig;
  readonly ignore: ResolvedIgnoreConfig;
  readonly interactions: ResolvedInteractionsConfig;
  readonly debug: boolean;
}

export interface ResolvedAppConfig {
  readonly name: string;
  readonly version: string;
  readonly environment: string;
  readonly buildId: string;
}

export interface ResolvedExporterConfig {
  readonly type: ExporterType;
  readonly url: string;
  readonly apiKey: string;
  readonly headers: Readonly<Record<string, string>>;
}

export interface ResolvedSamplingConfig {
  readonly rate: number;
}

export interface ResolvedSignalsConfig {
  readonly renders: boolean;
  readonly interactions: boolean;
  readonly routes: boolean;
  readonly errors: boolean;
  readonly network: boolean;
  readonly memory: boolean;
  readonly longTasks: boolean;
  readonly webVitals: boolean;
  readonly customEvents: boolean;
  readonly resourceTiming: boolean;
}

export interface ResolvedBatchConfig {
  readonly size: number;
  readonly flushIntervalMs: number;
  readonly maxQueueSize: number;
}

export interface ResolvedPrivacyConfig {
  readonly stripQueryParams: boolean;
  readonly respectDoNotTrack: boolean;
}

export interface ResolvedIgnoreConfig {
  readonly components: ReadonlyArray<string>;
  readonly urls: ReadonlyArray<string>;
}

export interface ResolvedInteractionsConfig {
  readonly inputDebounceMs: number;
  readonly rageClick: ResolvedRageClickConfig;
  readonly maxPropertiesSizeBytes: number;
}

export interface ResolvedRageClickConfig {
  readonly threshold: number;
  readonly windowMs: number;
}
