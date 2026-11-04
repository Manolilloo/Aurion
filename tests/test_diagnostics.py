import json
import os
import tempfile
import unittest

from core.diagnostics import record_download_event


class DownloadDiagnosticsTests(unittest.TestCase):
    def test_records_allowlisted_fields_without_urls_or_paths(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertTrue(record_download_event(
                "completed",
                {
                    "protocol": "hls",
                    "host": "cdn.example",
                    "size_bytes": 1048576,
                    "average_speed_mib_s": 4.5,
                    "url": "https://cdn.example/video.m3u8?token=secret",
                    "file_path": r"C:\\Users\\User\\Videos\\private.mkv",
                },
                app_data_dir=root,
            ))

            log_path = os.path.join(root, "logs", "download_diagnostics.jsonl")
            with open(log_path, "r", encoding="utf-8") as log_file:
                entry = json.loads(log_file.readline())

            self.assertEqual(entry["protocol"], "hls")
            self.assertEqual(entry["host"], "cdn.example")
            self.assertNotIn("url", entry)
            self.assertNotIn("file_path", entry)
            with open(log_path, "r", encoding="utf-8") as log_file:
                log_text = log_file.read()
            self.assertNotIn("secret", log_text)

    def test_rotates_log_when_size_limit_is_reached(self):
        with tempfile.TemporaryDirectory() as root:
            for _ in range(3):
                self.assertTrue(record_download_event(
                    "started",
                    {"protocol": "dash", "host": "cdn.example"},
                    app_data_dir=root,
                    max_bytes=1,
                ))

            log_path = os.path.join(root, "logs", "download_diagnostics.jsonl")
            self.assertTrue(os.path.isfile(log_path))
            self.assertTrue(os.path.isfile(log_path + ".1"))

    def test_rejects_unknown_event_names(self):
        with tempfile.TemporaryDirectory() as root:
            self.assertFalse(record_download_event("debug", {}, app_data_dir=root))
            self.assertFalse(os.path.exists(os.path.join(root, "logs")))


if __name__ == "__main__":
    unittest.main()
