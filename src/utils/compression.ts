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
 * Compresses a string payload using gzip via the CompressionStream API.
 * Returns the original string uncompressed if CompressionStream is unavailable.
 * Feature-detected on every call — never assumed available.
 */
export const compressPayload = async (
  payloadString: string
): Promise<{ data: BodyInit; encoding: string | null }> => {
  if (typeof CompressionStream === "undefined") {
    return { data: payloadString, encoding: null };
  }

  try {
    const encodedBytes = new TextEncoder().encode(payloadString);
    const compressionStream = new CompressionStream("gzip");
    const writer = compressionStream.writable.getWriter();
    writer.write(encodedBytes);
    writer.close();

    const compressedChunks: Uint8Array[] = [];
    const reader = compressionStream.readable.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) compressedChunks.push(value);
    }

    const totalLength = compressedChunks.reduce(
      (sum, chunk) => sum + chunk.length,
      0
    );
    const compressedData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of compressedChunks) {
      compressedData.set(chunk, offset);
      offset += chunk.length;
    }

    return { data: compressedData, encoding: "gzip" };
  } catch {
    // Compression failed — fall back to uncompressed
    return { data: payloadString, encoding: null };
  }
};
