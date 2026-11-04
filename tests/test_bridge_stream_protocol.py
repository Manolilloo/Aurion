import json
import unittest

from core.bridge import AurionBridge


class FakeWindow:
    def __init__(self):
        self.scripts = []

    def evaluate_js(self, script):
        self.scripts.append(script)


class ExtensionStreamProtocolTests(unittest.TestCase):
    def make_bridge(self):
        bridge = object.__new__(AurionBridge)
        bridge.config = {"anime": {"active_title": ""}}
        bridge._window = FakeWindow()
        return bridge

    def received_payload(self, bridge):
        script = bridge._window.scripts[-1]
        marker = "window.onLinkReceived("
        start = script.index(marker) + len(marker)
        end = script.rindex(");")
        return json.loads(script[start:end])

    def test_forwards_detected_dash_protocol(self):
        bridge = self.make_bridge()

        accepted = bridge.on_extension_link({
            "page_title": "Demo",
            "page_url": "https://player.example/watch/123",
            "stream_url": "https://cdn.example/manifest?id=opaque",
            "protocol": "dash",
        })

        self.assertTrue(accepted)
        self.assertEqual(self.received_payload(bridge)["protocol"], "dash")

    def test_unknown_protocol_falls_back_to_direct_http(self):
        bridge = self.make_bridge()

        accepted = bridge.on_extension_link({
            "page_url": "https://player.example/watch/123",
            "stream_url": "https://cdn.example/video.mp4",
            "protocol": "ftp",
        })

        self.assertTrue(accepted)
        self.assertEqual(self.received_payload(bridge)["protocol"], "http")

    def test_legacy_extension_payload_defaults_to_http(self):
        bridge = self.make_bridge()

        accepted = bridge.on_extension_link({
            "page_url": "https://player.example/watch/123",
            "stream_url": "https://cdn.example/video.mp4",
        })

        self.assertTrue(accepted)
        self.assertEqual(self.received_payload(bridge)["protocol"], "http")


if __name__ == "__main__":
    unittest.main()
