const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyStreamUrl } = require("../extension/stream_classifier.js");

test("recognizes DASH manifests even with query strings", () => {
  const result = classifyStreamUrl("https://cdn.example/dash.mpd?token=abc");
  assert.equal(result.protocol, "dash");
  assert.equal(result.isManifest, true);
  assert.equal(result.sourceLabel, "DASH STREAM");
  assert.equal(result.isVideoCandidate, false);
});

test("recognizes DASH from MIME type when the URL has no .mpd extension", () => {
  const result = classifyStreamUrl(
    "https://cdn.example/manifest?id=abc",
    "application/dash+xml"
  );
  assert.equal(result.protocol, "dash");
  assert.equal(result.isManifest, true);
  assert.equal(result.sourceLabel, "DASH STREAM");
});

test("recognizes HLS manifests", () => {
  const byUrl = classifyStreamUrl("https://cdn.example/master.m3u8?token=abc");
  const byMime = classifyStreamUrl("https://cdn.example/manifest", "application/vnd.apple.mpegurl");
  assert.equal(byUrl.protocol, "hls");
  assert.equal(byMime.protocol, "hls");
  assert.equal(byUrl.sourceLabel, "HLS STREAM");
});

test("labels direct WebM separately from MP4", () => {
  const webm = classifyStreamUrl("https://cdn.example/video_576p_vp9.webm");
  const mp4 = classifyStreamUrl("https://cdn.example/video_720p.mp4");
  assert.equal(webm.sourceLabel, "DIRECT WEBM");
  assert.equal(webm.kind, "webm");
  assert.equal(webm.isVideoCandidate, true);
  assert.equal(mp4.sourceLabel, "DIRECT MP4");
  assert.equal(mp4.isVideoCandidate, true);
});

test("does not expose explicit audio rendition MP4 as a video source", () => {
  const audio = classifyStreamUrl(
    "https://storage.googleapis.com/shaka-demo-assets/angel-one/audio_es_2c_128k_aac.mp4"
  );
  assert.equal(audio.isAudioOnly, true);
  assert.equal(audio.isVideoCandidate, false);
});

test("does not expose audio MIME responses as video sources", () => {
  const audio = classifyStreamUrl("https://cdn.example/track.mp4", "audio/mp4");
  assert.equal(audio.isAudioOnly, true);
  assert.equal(audio.isVideoCandidate, false);
});

test("recognizes extensionless video playback URLs from video MIME", () => {
  const result = classifyStreamUrl("https://cdn.example/videoplayback?id=123", "video/webm");
  assert.equal(result.isVideoCandidate, true);
  assert.equal(result.sourceLabel, "DIRECT WEBM");
});

test("rejects malformed URLs", () => {
  const result = classifyStreamUrl("not a url");
  assert.equal(result.isManifest, false);
  assert.equal(result.isVideoCandidate, false);
});
