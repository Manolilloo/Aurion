import os
import tempfile
import unittest
from types import SimpleNamespace

from core.downloader import AurionDownloader


class RecordingWindow:
    def __init__(self):
        self.calls = []

    def evaluate_js(self, script):
        self.calls.append(script)


class DownloaderSkipTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.window = RecordingWindow()
        self.downloader = object.__new__(AurionDownloader)
        self.downloader.bridge = SimpleNamespace(_window=self.window)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_skip_preserves_existing_small_file(self):
        path = os.path.join(self.temp_dir.name, "small-video.mp4")
        original = b"existing file smaller than one megabyte"
        with open(path, "wb") as output:
            output.write(original)

        skipped = self.downloader._skip_existing_output("task_1", path, "skip")

        self.assertTrue(skipped)
        with open(path, "rb") as source:
            self.assertEqual(source.read(), original)
        self.assertEqual(len(self.window.calls), 2)
        self.assertIn("Omitido", self.window.calls[1])

    def test_other_policies_do_not_skip_existing_file(self):
        path = os.path.join(self.temp_dir.name, "video.mp4")
        with open(path, "wb") as output:
            output.write(b"existing")

        self.assertFalse(self.downloader._skip_existing_output("task_1", path, "rename"))
        self.assertFalse(self.downloader._skip_existing_output("task_1", path, "overwrite"))
        self.assertEqual(self.window.calls, [])

    def test_skip_returns_false_when_destination_is_missing(self):
        path = os.path.join(self.temp_dir.name, "missing.mp4")
        self.assertFalse(self.downloader._skip_existing_output("task_1", path, "skip"))


if __name__ == "__main__":
    unittest.main()
