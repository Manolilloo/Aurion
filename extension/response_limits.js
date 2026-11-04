/*
 * Reads text from Fetch Response objects without buffering unbounded bodies.
 * Shared by the extension service worker and Node.js unit tests.
 */
async function readBoundedResponseText(response, maxBytes = 2 * 1024 * 1024) {
  if (!response || !Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new TypeError("Invalid response or byte limit");
  }

  const declaredHeader = response.headers?.get?.("content-length");
  if (declaredHeader !== null && declaredHeader !== undefined && declaredHeader.trim() !== "") {
    const declaredLength = Number(declaredHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      try { await response.body?.cancel(); } catch (_) {}
      throw new RangeError("Response exceeds maximum allowed size");
    }
  }

  if (!response.body || typeof response.body.getReader !== "function") {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new RangeError("Response exceeds maximum allowed size");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        try { await reader.cancel(); } catch (_) {}
        throw new RangeError("Response exceeds maximum allowed size");
      }
      chunks.push(chunk);
    }
  } finally {
    try { reader.releaseLock(); } catch (_) {}
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8").decode(combined);
}

if (typeof globalThis !== "undefined") {
  globalThis.readBoundedResponseText = readBoundedResponseText;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { readBoundedResponseText };
}
