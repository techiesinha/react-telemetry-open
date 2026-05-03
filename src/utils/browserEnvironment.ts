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
 * Returns true only when running in a real browser environment.
 * Returns false in SSR (Node.js), jsdom (test environments),
 * and React Native.
 *
 * This guard must be called before any browser API access.
 */
export const isBrowser = (): boolean => {
  if (typeof window === "undefined") return false;
  if (typeof document === "undefined") return false;
  if (typeof performance === "undefined") return false;
  // jsdom identifies itself in the user agent string
  if (
    typeof navigator !== "undefined" &&
    navigator.userAgent.includes("jsdom")
  ) {
    return false;
  }
  return true;
};

/**
 * Adds an event listener to window with SSR safety.
 * Returns a cleanup function that removes the listener.
 * Returns a no-op cleanup function in SSR environments.
 */
export const addWindowListener = <EventType extends Event>(
  eventName: string,
  handler: (event: EventType) => void,
  options?: AddEventListenerOptions
): (() => void) => {
  if (typeof window === "undefined") return () => {};
  // Cast required because addEventListener uses overloads
  window.addEventListener(eventName, handler as EventListener, options);
  return () =>
    window.removeEventListener(eventName, handler as EventListener, options);
};

/**
 * Adds an event listener to document with SSR safety.
 * Returns a cleanup function that removes the listener.
 * Returns a no-op cleanup function in SSR environments.
 */
export const addDocumentListener = <EventType extends Event>(
  eventName: string,
  handler: (event: EventType) => void,
  options?: AddEventListenerOptions
): (() => void) => {
  if (typeof document === "undefined") return () => {};
  document.addEventListener(eventName, handler as EventListener, options);
  return () =>
    document.removeEventListener(eventName, handler as EventListener, options);
};
