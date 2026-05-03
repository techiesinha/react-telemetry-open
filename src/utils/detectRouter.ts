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

import { RouterType } from "../types/internal";

/**
 * Detects which router is available in the current environment.
 * Uses duck-typing to avoid hard dependencies on router packages.
 * Must be called outside any hook — does not use React hooks itself.
 */
export const detectRouter = (): RouterType => {
  // Next.js App Router detection — next/navigation module
  if (typeof window !== "undefined" && "__NEXT_ROUTER_BASEPATH" in window) {
    return RouterType.NextJsApp;
  }

  // Next.js Pages Router detection — __NEXT_DATA__ is injected at page load
  if (typeof window !== "undefined" && "__NEXT_DATA__" in window) {
    return RouterType.NextJsPages;
  }

  // React Router 6 detection — checks for the context object React Router
  // registers on the window during development or via module resolution
  try {
    // Attempt to resolve react-router-dom — will throw if not installed
    // This is a build-time check via module resolution, not runtime eval
    if (typeof require !== "undefined") {
      require.resolve("react-router-dom");
      return RouterType.ReactRouter;
    }
  } catch {
    // react-router-dom not installed
  }

  return RouterType.None;
};
