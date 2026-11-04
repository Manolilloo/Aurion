const test = require("node:test");
const assert = require("node:assert/strict");
const { readBoundedResponseText } = require("../extension/response_limits.js");

test("reads a response within the byte limit", async () => {
  const response = new Response("Aurion manifest");
  assert.equal(await readBoundedResponseText(response, 64), "Aurion manifest");
});

test("rejects a response whose declared content length exceeds the limit", async () => {
  const response = new Response("too large", {
    headers: { "content-length": "9" }
  });
  await assert.rejects(
    readBoundedResponseText(response, 8),
    /maximum allowed size/i
  );
});

test("rejects a streamed response that exceeds the limit without content length", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("1234"));
      controller.enqueue(new TextEncoder().encode("5678"));
      controller.close();
    }
  });
  const response = new Response(body);
  await assert.rejects(
    readBoundedResponseText(response, 6),
    /maximum allowed size/i
  );
});
