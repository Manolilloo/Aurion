const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "../extension/page_network_observer.js"),
  "utf8"
);

function createHarness(fetchImpl = async () => ({
  ok: true,
  url: "https://cdn.example/video.mp4",
  headers: { get: () => "video/mp4" }
})) {
  const messages = [];
  const window = {
    location: { href: "https://player.example/watch" },
    postMessage(message) {
      messages.push(message);
    },
    fetch: fetchImpl
  };

  class FakeXMLHttpRequest {
    constructor() {
      this.status = 200;
      this.responseURL = "";
      this.headers = {};
      this.listeners = new Map();
    }

    open(method, url) {
      this.requestUrl = url;
      this.responseURL = url;
    }

    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(callback);
      this.listeners.set(name, callbacks);
    }

    getResponseHeader(name) {
      return this.headers[String(name).toLowerCase()] || null;
    }

    send() {
      for (const callback of this.listeners.get("loadend") || []) {
        callback.call(this);
      }
    }
  }

  vm.runInNewContext(source, {
    window,
    XMLHttpRequest: FakeXMLHttpRequest,
    URL,
    WeakMap,
    Reflect,
    Promise,
    Object,
    String
  });

  return { window, messages, FakeXMLHttpRequest };
}

test("detects extensionless DASH manifests from fetch response MIME", async () => {
  const harness = createHarness(async () => ({
    ok: true,
    url: "https://cdn.example/manifest?id=abc",
    headers: { get: () => "application/dash+xml; charset=utf-8" }
  }));

  await harness.window.fetch("https://cdn.example/request");
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(harness.messages.length, 1);
  assert.equal(harness.messages[0].url, "https://cdn.example/manifest?id=abc");
  assert.equal(harness.messages[0].contentType, "application/dash+xml");
});

test("detects HLS manifests requested through XMLHttpRequest", () => {
  const harness = createHarness();
  const request = new harness.FakeXMLHttpRequest();
  request.headers["content-type"] = "application/vnd.apple.mpegurl";
  request.open("GET", "https://cdn.example/manifest");
  request.send();

  assert.equal(harness.messages.length, 1);
  assert.equal(harness.messages[0].type, "AURION_MANIFEST_RESOURCE");
  assert.equal(harness.messages[0].url, "https://cdn.example/manifest");
  assert.equal(harness.messages[0].contentType, "application/vnd.apple.mpegurl");
});

test("ignores unsuccessful and non-manifest fetch responses", async () => {
  const failed = createHarness(async () => ({
    ok: false,
    url: "https://cdn.example/manifest.mpd",
    headers: { get: () => "application/dash+xml" }
  }));
  await failed.window.fetch("https://cdn.example/manifest.mpd");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.messages.length, 0);

  const ordinaryVideo = createHarness();
  await ordinaryVideo.window.fetch("https://cdn.example/video.mp4");
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(ordinaryVideo.messages.length, 0);
});
