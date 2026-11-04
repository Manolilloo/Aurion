import json
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer

from core.bridge import AurionHTTPHandler


EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnopabcdefghijklmnop"


class FakeBridge:
    def __init__(self):
        self.received = []

    def on_extension_link(self, data):
        self.received.append(data)
        return True


class HttpApiTests(unittest.TestCase):
    def setUp(self):
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), AurionHTTPHandler)
        host, port = self.server.server_address
        self.server.RequestHandlerClass.ALLOWED_HOSTS = {f"{host}:{port}"}
        self.server.bridge_instance = FakeBridge()
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.host = host
        self.port = port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def request(self, method, path, body=None, origin=EXTENSION_ORIGIN, content_type="application/json"):
        connection = HTTPConnection(self.host, self.port, timeout=3)
        headers = {"Origin": origin}
        if content_type:
            headers["Content-Type"] = content_type
        encoded = None if body is None else (
            body if isinstance(body, bytes) else json.dumps(body).encode("utf-8")
        )
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        status = response.status
        connection.close()
        return status, payload

    def test_valid_enqueue_is_forwarded(self):
        data = {
            "page_title": "Demo",
            "page_url": "https://www3.animeflv.net/ver/demo",
            "stream_url": "https://cdn.example.net/video.m3u8",
            "resolution": "1080p",
            "bytes": 1234,
        }
        status, body = self.request("POST", "/api/enqueue", data)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["status"], "ok")
        self.assertEqual(self.server.bridge_instance.received, [data])

    def test_untrusted_origin_is_rejected(self):
        status, _ = self.request(
            "POST",
            "/api/enqueue",
            {"stream_url": "https://cdn.example.net/video.mp4"},
            origin="https://attacker.example",
        )
        self.assertEqual(status, 403)
        self.assertEqual(self.server.bridge_instance.received, [])

    def test_invalid_content_type_is_rejected(self):
        status, _ = self.request(
            "POST",
            "/api/enqueue",
            b'{"stream_url":"https://cdn.example.net/video.mp4"}',
            content_type="text/plain",
        )
        self.assertEqual(status, 415)

    def test_oversized_request_is_rejected_before_parsing(self):
        body = b"x" * (AurionHTTPHandler.MAX_BODY_BYTES + 1)
        status, _ = self.request("POST", "/api/enqueue", body)
        self.assertEqual(status, 413)

    def test_unknown_endpoint_is_rejected(self):
        status, _ = self.request("POST", "/api/anything", {"x": 1})
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
