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

import type { MetricName, SignalType } from "./signalTypes";
import type { DeviceType, RouterType } from "./domainTypes";

/** Attribute value — strictly typed to prevent OTLP serialisation errors */
export type AttributeValue = string | number | boolean | null;

/** Safe attribute map */
export type AttributeMap = Record<string, AttributeValue>;

/**
 * Raw event emitted directly from hooks and collectors to the Signal Bus.
 * Contains only volatile context — captured synchronously at the moment
 * the event occurs.
 */
export interface RawEvent {
  /** OTel signal primitive type */
  readonly type: SignalType;
  /** Metric or event name */
  readonly name: MetricName | string;

  /** Wall clock timestamp in milliseconds — Date.now() */
  readonly timestamp: number;
  /** Current route pattern at time of event */
  readonly route: string;
  /** Anonymous session identifier */
  readonly sessionId: string;

  /** High-resolution start time — performance.now() — for duration events */
  readonly startTime?: number;
  /** High-resolution end time — performance.now() — for duration events */
  readonly endTime?: number;
  /** Duration in milliseconds — endTime minus startTime */
  readonly duration?: number;

  /** Numeric value for metric events */
  readonly value?: number;
  /** Unit of measurement for metric values */
  readonly unit?: string;

  /** Signal-specific attributes */
  readonly attributes: AttributeMap;
}

/**
 * Enriched event after the Pipeline enrich stage.
 * Contains both volatile context (from RawEvent) and stable context
 * (device, browser, OS, app metadata attached asynchronously).
 */
export interface EnrichedEvent extends RawEvent {
  readonly app: AppContext;
  readonly session: SessionContext;
  readonly device: DeviceContext;
  readonly browser: BrowserContext;
  readonly os: OsContext;
  readonly network: NetworkContext;
  readonly react: ReactContext;
  readonly deployment: DeploymentContext;
}

/** Processed event after sample and filter stages — structurally identical to EnrichedEvent */
export type ProcessedEvent = EnrichedEvent;

/** Application identity context */
export interface AppContext {
  readonly name: string;
  readonly version: string;
  readonly environment: string;
  readonly buildId: string;
}

/** Session context — groups events from one continuous visit */
export interface SessionContext {
  readonly id: string;
  readonly startTime: number;
  readonly duration: number;
  readonly pageViews: number;
}

/** Device hardware context */
export interface DeviceContext {
  readonly memory: number | null;
  readonly cpuCores: number;
  readonly type: DeviceType;
  readonly viewport: ViewportContext;
  readonly touchEnabled: boolean;
}

/** Viewport dimensions */
export interface ViewportContext {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Browser identity context */
export interface BrowserContext {
  readonly name: string;
  readonly version: string;
  readonly engine: string;
  readonly language: string;
}

/** Operating system context */
export interface OsContext {
  readonly name: string;
  readonly version: string | null;
}

/** Network connection context */
export interface NetworkContext {
  readonly type: string;
  readonly downlink: number | null;
  readonly rtt: number | null;
  readonly saveData: boolean;
  readonly online: boolean;
}

/** React runtime context */
export interface ReactContext {
  readonly version: string;
  readonly mode: "concurrent" | "legacy";
  readonly strictMode: boolean;
}

/** Deployment and package context */
export interface DeploymentContext {
  readonly packageVersion: string;
  readonly collectorEndpoint: string;
}

/** Complete session snapshot used by the enrich stage */
export interface SessionSnapshot {
  readonly sessionId: string;
  readonly sessionStartTime: number;
  readonly pageViews: number;
  readonly device: DeviceContext;
  readonly browser: BrowserContext;
  readonly os: OsContext;
  readonly network: NetworkContext;
  readonly routerType: RouterType;
}
