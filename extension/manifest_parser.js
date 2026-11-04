/*
 * Small, dependency-free parsers for HLS and DASH manifest metadata.
 * Shared by the MV3 service worker and Node.js unit tests.
 */
function parseHlsManifest(text) {
  const source = String(text || "");
  let bestHeight = 0;
  for (const match of source.matchAll(/RESOLUTION=\d+x(\d+)/gi)) {
    bestHeight = Math.max(bestHeight, Number.parseInt(match[1], 10) || 0);
  }

  let bestBandwidth = 0;
  for (const match of source.matchAll(/BANDWIDTH=(\d+)/gi)) {
    bestBandwidth = Math.max(bestBandwidth, Number.parseInt(match[1], 10) || 0);
  }

  let totalSeconds = 0;
  for (const match of source.matchAll(/#EXTINF:([\d.]+)/gi)) {
    totalSeconds += Number.parseFloat(match[1]) || 0;
  }

  let bytes = 0;
  if (totalSeconds > 0 && bestBandwidth > 0) {
    bytes = Math.round((bestBandwidth * totalSeconds) / 8);
  } else if (bestBandwidth > 0) {
    bytes = Math.round((bestBandwidth * 1440) / 8);
  } else if (bestHeight > 0) {
    const bitrates = { 1080: 2500000, 720: 1400000, 480: 750000, 360: 400000 };
    bytes = Math.round(((bitrates[bestHeight] || 1600000) * 1440) / 8);
  }

  return {
    res: bestHeight > 0 ? `${bestHeight}p` : "Auto",
    bytes
  };
}

function parseIsoDurationSeconds(value) {
  const match = String(value || "").match(
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i
  );
  if (!match) return 0;

  const days = Number.parseFloat(match[1] || "0");
  const hours = Number.parseFloat(match[2] || "0");
  const minutes = Number.parseFloat(match[3] || "0");
  const seconds = Number.parseFloat(match[4] || "0");
  const total = days * 86400 + hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : 0;
}

function parseDashManifest(text) {
  const source = String(text || "");
  let bestHeight = 0;
  for (const match of source.matchAll(/\bheight\s*=\s*["'](\d+)["']/gi)) {
    bestHeight = Math.max(bestHeight, Number.parseInt(match[1], 10) || 0);
  }

  let bestBandwidth = 0;
  for (const match of source.matchAll(/\bbandwidth\s*=\s*["'](\d+)["']/gi)) {
    bestBandwidth = Math.max(bestBandwidth, Number.parseInt(match[1], 10) || 0);
  }

  let durationSeconds = 0;
  for (const match of source.matchAll(/\b(?:mediaPresentationDuration|duration)\s*=\s*["']([^"']+)["']/gi)) {
    durationSeconds = Math.max(durationSeconds, parseIsoDurationSeconds(match[1]));
  }

  const bytes = bestBandwidth > 0 && durationSeconds > 0
    ? Math.round((bestBandwidth * durationSeconds) / 8)
    : 0;

  return {
    res: bestHeight > 0 ? `${bestHeight}p` : "Auto",
    bytes
  };
}

function parseMediaManifest(url, text) {
  const isDashUrl = /\.mpd(?:[?#]|$)/i.test(String(url || ""));
  const isDashXml = /<(?:[\w.-]+:)?MPD(?:\s|>)/i.test(String(text || ""));
  return isDashUrl || isDashXml ? parseDashManifest(text) : parseHlsManifest(text);
}

if (typeof globalThis !== "undefined") {
  globalThis.parseMediaManifest = parseMediaManifest;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    parseHlsManifest,
    parseDashManifest,
    parseIsoDurationSeconds,
    parseMediaManifest
  };
}
