const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDashManifest,
  parseHlsManifest,
  parseIsoDurationSeconds,
  parseMediaManifest
} = require("../extension/manifest_parser.js");

test("HLS parser extracts resolution and estimates media size", () => {
  const manifest = [
    "#EXTM3U",
    "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
    "video.m3u8",
    "#EXTINF:10.0,",
    "segment.ts"
  ].join("\n");

  const result = parseHlsManifest(manifest);
  assert.equal(result.res, "1080p");
  assert.equal(result.bytes, 6250000);
});

test("DASH parser extracts the highest representation and duration", () => {
  const manifest = `<MPD mediaPresentationDuration="PT2M">
    <Period>
      <AdaptationSet>
        <Representation bandwidth="1500000" width="1280" height="720" />
        <Representation bandwidth="5000000" width="1920" height="1080" />
      </AdaptationSet>
    </Period>
  </MPD>`;

  const result = parseDashManifest(manifest);
  assert.equal(result.res, "1080p");
  assert.equal(result.bytes, 75000000);
});

test("DASH parser accepts fractional ISO 8601 durations", () => {
  assert.equal(parseIsoDurationSeconds("PT1H2M3.5S"), 3723.5);
  assert.equal(parseIsoDurationSeconds("P1DT2H"), 93600);
  assert.equal(parseIsoDurationSeconds("invalid"), 0);
});

test("manifest parser selects DASH from its URL even with a query string", () => {
  const result = parseMediaManifest(
    "https://cdn.example/stream.mpd?token=abc",
    '<MPD mediaPresentationDuration="PT10S"><Representation bandwidth="800000" height="480" /></MPD>'
  );

  assert.equal(result.res, "480p");
  assert.equal(result.bytes, 1000000);
});

test("DASH XML is detected even when the URL has no manifest extension", () => {
  const result = parseMediaManifest(
    "https://cdn.example/manifest?id=abc",
    '<MPD mediaPresentationDuration="PT30S"><Representation bandwidth="2000000" height="720" /></MPD>'
  );

  assert.equal(result.res, "720p");
  assert.equal(result.bytes, 7500000);
});

test("missing DASH duration does not invent a file size", () => {
  const result = parseDashManifest('<MPD><Representation bandwidth="4000000" height="1080" /></MPD>');
  assert.equal(result.res, "1080p");
  assert.equal(result.bytes, 0);
});
