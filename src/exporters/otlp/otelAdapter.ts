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
 * OTLP/HTTP JSON serialisation — manual implementation.
 *
 * Implements the OpenTelemetry Protocol Specification v1.3.2:
 *   https://opentelemetry.io/docs/specs/otlp/
 *   https://github.com/open-telemetry/opentelemetry-proto/tree/v1.3.2
 *
 * Specifically implements:
 *   opentelemetry-proto/opentelemetry/proto/metrics/v1/metrics.proto
 *   opentelemetry-proto/opentelemetry/proto/trace/v1/trace.proto
 *   opentelemetry-proto/opentelemetry/proto/logs/v1/logs.proto
 *   opentelemetry-proto/opentelemetry/proto/common/v1/common.proto
 *
 * Known limitations vs full spec:
 *   - All metrics emitted as Gauge (not Histogram or Sum) — planned for v1.1.0
 *   - Spans have no parentSpanId — all appear as root spans — planned for v2.0.0
 *   - No W3C traceparent propagation — planned for v2.0.0
 *
 * This file does not import from @opentelemetry/api or any OTel SDK package.
 * OTLP serialisation is implemented from scratch against the proto spec above.
 */

import type { ProcessedEvent, EnrichedEvent } from "../../types/internal";
import { SignalType } from "../../types/internal";
import { formatAttributes } from "../../utils/formatAttributes";
import { generateTraceId, generateSpanId } from "../../utils/timing";
import { PACKAGE_VERSION } from "../../constants/defaults";

/** OTLP attribute key-value pair as required by OTLP/HTTP JSON spec */
interface OtlpKeyValue {
  key: string;
  value: { stringValue?: string; intValue?: number; doubleValue?: number; boolValue?: boolean };
}

/** OTLP resource block */
interface OtlpResource {
  attributes: OtlpKeyValue[];
}

/** Complete OTLP HTTP payload */
export interface OtlpPayload {
  resourceMetrics?: OtlpResourceMetrics[];
  resourceTraces?: OtlpResourceTraces[];
  resourceLogs?: OtlpResourceLogs[];
}

interface OtlpResourceMetrics {
  resource: OtlpResource;
  scopeMetrics: OtlpScopeMetrics[];
}

interface OtlpScopeMetrics {
  scope: OtlpScope;
  metrics: OtlpMetric[];
}

interface OtlpResourceTraces {
  resource: OtlpResource;
  scopeSpans: OtlpScopeSpans[];
}

interface OtlpScopeSpans {
  scope: OtlpScope;
  spans: OtlpSpan[];
}

interface OtlpResourceLogs {
  resource: OtlpResource;
  scopeLogs: OtlpScopeLogs[];
}

interface OtlpScopeLogs {
  scope: OtlpScope;
  logRecords: OtlpLogRecord[];
}

interface OtlpScope {
  name: string;
  version: string;
}

interface OtlpMetric {
  name: string;
  unit?: string;
  gauge: { dataPoints: OtlpDataPoint[] };
}

interface OtlpDataPoint {
  timeUnixNano: string;
  asDouble: number;
  attributes: OtlpKeyValue[];
}

interface OtlpSpan {
  traceId: string;
  spanId: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OtlpKeyValue[];
  status: { code: number; message?: string };
}

interface OtlpLogRecord {
  timeUnixNano: string;
  severityNumber: number;
  severityText: string;
  body: { stringValue: string };
  attributes: OtlpKeyValue[];
}

const OTLP_SCOPE_NAME = "react-telemetry-open";
// PACKAGE_VERSION is replaced at build time by tsup via esbuildOptions.define
const OTLP_SCOPE_VERSION = PACKAGE_VERSION;

/** Converts milliseconds to nanoseconds string for OTLP */
const msToNanosString = (milliseconds: number): string =>
  String(Math.floor(milliseconds * 1_000_000));

/** Span kind constants per OTel specification */
const SPAN_KIND_INTERNAL = 1;
const SPAN_KIND_CLIENT = 3;

/** Log severity numbers per OTel specification */
const SEVERITY_INFO = 9;
const SEVERITY_ERROR = 17;

/**
 * Builds the OTLP resource block from an event's stable context.
 * All stable app/device/browser attributes are placed at resource level.
 */
const buildOtlpResource = (event: EnrichedEvent): OtlpResource => ({
  attributes: [
    { key: "service.name", value: { stringValue: event.app.name } },
    { key: "service.version", value: { stringValue: event.app.version } },
    { key: "deployment.environment", value: { stringValue: event.app.environment } },
    { key: "service.instance.id", value: { stringValue: event.deployment.packageVersion } },
    { key: "telemetry.sdk.name", value: { stringValue: OTLP_SCOPE_NAME } },
    { key: "telemetry.sdk.version", value: { stringValue: OTLP_SCOPE_VERSION } },
    { key: "device.type", value: { stringValue: event.device.type } },
    { key: "browser.platform", value: { stringValue: event.browser.name } },
    { key: "os.name", value: { stringValue: event.os.name } },
  ],
});

const buildOtlpScope = (): OtlpScope => ({
  name: OTLP_SCOPE_NAME,
  version: OTLP_SCOPE_VERSION,
});

/**
 * Converts metric events to an OTLP metrics payload.
 * Send to: {baseUrl}/v1/metrics
 */
export const toMetricsPayload = (batch: ProcessedEvent[]): OtlpPayload => {
  const metricEvents = batch.filter((e) => e.type === SignalType.Metric);
  if (metricEvents.length === 0) return {};
  return { resourceMetrics: [buildResourceMetrics(metricEvents)] };
};

/**
 * Converts span events to an OTLP traces payload.
 * Send to: {baseUrl}/v1/traces
 */
export const toTracesPayload = (batch: ProcessedEvent[]): OtlpPayload => {
  const spanEvents = batch.filter((e) => e.type === SignalType.Span);
  if (spanEvents.length === 0) return {};
  return { resourceTraces: [buildResourceTraces(spanEvents)] };
};

/**
 * Converts log events to an OTLP logs payload.
 * Send to: {baseUrl}/v1/logs
 */
export const toLogsPayload = (batch: ProcessedEvent[]): OtlpPayload => {
  const logEvents = batch.filter((e) => e.type === SignalType.Log);
  if (logEvents.length === 0) return {};
  return { resourceLogs: [buildResourceLogs(logEvents)] };
};

/**
 * @deprecated Use toMetricsPayload, toTracesPayload, toLogsPayload separately.
 * Kept for backwards compatibility — will be removed in v2.0.0.
 */
export const toOtlpPayload = (batch: ProcessedEvent[]): OtlpPayload => {
  const payload: OtlpPayload = {};
  const metrics = toMetricsPayload(batch);
  const traces = toTracesPayload(batch);
  const logs = toLogsPayload(batch);
  if (metrics.resourceMetrics) payload.resourceMetrics = metrics.resourceMetrics;
  if (traces.resourceTraces) payload.resourceTraces = traces.resourceTraces;
  if (logs.resourceLogs) payload.resourceLogs = logs.resourceLogs;
  return payload;
};

const buildResourceMetrics = (events: ProcessedEvent[]): OtlpResourceMetrics => ({
  resource: buildOtlpResource(events[0]!),
  scopeMetrics: [
    {
      scope: buildOtlpScope(),
      metrics: events.map(buildOtlpMetric),
    },
  ],
});

const buildOtlpMetric = (event: ProcessedEvent): OtlpMetric => ({
  name: event.name,
  // exactOptionalPropertyTypes requires we omit the key rather than assign undefined
  ...(event.unit !== undefined ? { unit: event.unit } : {}),
  gauge: {
    dataPoints: [
      {
        // Convert ms timestamp to nanoseconds for OTLP
        timeUnixNano: msToNanosString(event.timestamp),
        asDouble: event.value ?? event.duration ?? 0,
        attributes: [
          ...formatAttributes({
            "session.id": event.sessionId,
            "http.route": event.route,
            ...event.attributes,
          }),
        ],
      },
    ],
  },
});

const buildResourceTraces = (events: ProcessedEvent[]): OtlpResourceTraces => ({
  resource: buildOtlpResource(events[0]!),
  scopeSpans: [
    {
      scope: buildOtlpScope(),
      spans: events.map(buildOtlpSpan),
    },
  ],
});

const buildOtlpSpan = (event: ProcessedEvent): OtlpSpan => {
  const isNetworkCall = event.name.startsWith("network.");
  const spanKind = isNetworkCall ? SPAN_KIND_CLIENT : SPAN_KIND_INTERNAL;
  const hasError =
    (event.attributes["ok"] === false) ||
    (event.attributes["error"] !== undefined);

  return {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    name: event.name,
    kind: spanKind,
    // Long task timestamps use performance.timeOrigin + entry.startTime — already in ms
    startTimeUnixNano: msToNanosString(event.startTime ?? event.timestamp),
    endTimeUnixNano: msToNanosString(event.endTime ?? event.timestamp),
    attributes: formatAttributes({
      "session.id": event.sessionId,
      "http.route": event.route,
      ...event.attributes,
    }),
    status: {
      code: hasError ? 2 : 1, // 1 = OK, 2 = ERROR per OTel spec
      ...(hasError && event.attributes["errorMessage"]
        ? { message: String(event.attributes["errorMessage"]) }
        : {}),
    },
  };
};

const buildResourceLogs = (events: ProcessedEvent[]): OtlpResourceLogs => ({
  resource: buildOtlpResource(events[0]!),
  scopeLogs: [
    {
      scope: buildOtlpScope(),
      logRecords: events.map(buildOtlpLogRecord),
    },
  ],
});

const buildOtlpLogRecord = (event: ProcessedEvent): OtlpLogRecord => {
  const isError =
    event.name.includes("error") || event.name.includes("rejection");

  return {
    timeUnixNano: msToNanosString(event.timestamp),
    severityNumber: isError ? SEVERITY_ERROR : SEVERITY_INFO,
    severityText: isError ? "ERROR" : "INFO",
    body: {
      stringValue:
        typeof event.attributes["message"] === "string"
          ? event.attributes["message"]
          : event.name,
    },
    attributes: formatAttributes({
      "session.id": event.sessionId,
      "http.route": event.route,
      ...event.attributes,
    }),
  };
};
