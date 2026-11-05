/*
 * Conservative stream classification shared by the extension service worker and tests.
 */
function classifyStreamUrl(rawUrl, contentType = "") {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ""));
  } catch (_) {
    return {
      protocol: "http",
      kind: "unknown",
      sourceLabel: "DIRECT VIDEO",
      isManifest: false,
      isAudioOnly: false,
      isVideoCandidate: false
    };
  }

  const pathname = parsed.pathname.toLowerCase();
  const filename = pathname.split("/").pop() || "";
  const mime = String(contentType || "").split(";")[0].trim().toLowerCase();

  const isDash = /\.mpd$/i.test(pathname) || mime.includes("dash+xml");
  const isHls = /\.m3u8$/i.test(pathname)
    || mime.includes("mpegurl")
    || mime.includes("vnd.apple.mpegurl")
    || mime.includes("x-mpegurl");
  const isManifest = isDash || isHls;

  // Explicit audio rendition names (for example audio_es_2c_128k_aac.mp4)
  // and audio MIME types must never be offered as standalone video sources.
  const isAudioOnly = mime.startsWith("audio/")
    || /^(?:audio|sound|voice)(?:[._-]|$)/i.test(filename);

  let kind = "unknown";
  if (isDash) kind = "dash";
  else if (isHls) kind = "hls";
  else if (/\.webm$/i.test(pathname) || mime === "video/webm") kind = "webm";
  else if (/\.mkv$/i.test(pathname) || mime === "video/x-matroska") kind = "mkv";
  else if (/\.mp4$/i.test(pathname) || mime === "video/mp4") kind = "mp4";

  const hasDirectVideoPath = /\.(?:mp4|webm|mkv)$/i.test(pathname)
    || /\/(?:videoplayback|get_video)$/i.test(pathname)
    || /\/dl$/i.test(pathname) && /(?:^|[?&])mime=video(?:%2f|\/)/i.test(parsed.search);
  const isVideoCandidate = !isManifest && !isAudioOnly
    && (hasDirectVideoPath || mime.startsWith("video/"));

  let sourceLabel = "DIRECT VIDEO";
  if (kind === "dash") sourceLabel = "DASH STREAM";
  else if (kind === "hls") sourceLabel = "HLS STREAM";
  else if (kind === "webm") sourceLabel = "DIRECT WEBM";
  else if (kind === "mkv") sourceLabel = "DIRECT MKV";
  else if (kind === "mp4") sourceLabel = "DIRECT MP4";

  return {
    protocol: isDash ? "dash" : (isHls ? "hls" : "http"),
    kind,
    sourceLabel,
    isManifest,
    isAudioOnly,
    isVideoCandidate
  };
}

if (typeof globalThis !== "undefined") {
  globalThis.classifyStreamUrl = classifyStreamUrl;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { classifyStreamUrl };
}
