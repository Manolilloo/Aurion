import threading
import unittest

from core.downloader import AurionDownloader


class DownloaderLifecycleTests(unittest.TestCase):
    def test_orchestrator_releases_running_state_after_setup_error(self):
        downloader = object.__new__(AurionDownloader)
        downloader.lock = threading.Lock()
        downloader.is_downloading = True
        downloader.cancelled_tasks = {"task_1"}
        downloader.bridge = None

        def raise_setup_error(_config):
            raise OSError("simulated destination failure")

        downloader.resolve_destination_folder = raise_setup_error
        downloader._orchestrate_downloads({}, [])

        self.assertFalse(downloader.is_downloading)
        self.assertEqual(downloader.cancelled_tasks, set())

    def test_engine_rejects_invalid_task_before_starting_thread(self):
        downloader = object.__new__(AurionDownloader)
        downloader.lock = threading.Lock()
        downloader.is_downloading = False
        downloader.cancelled_tasks = set()
        downloader.queue = []

        self.assertFalse(downloader.start_engine({}, [{
            "id": "../escape",
            "url": "https://example.com/video.mp4",
        }]))
        self.assertFalse(downloader.is_downloading)

    def test_engine_rejects_non_http_download_urls(self):
        downloader = object.__new__(AurionDownloader)
        downloader.lock = threading.Lock()
        downloader.is_downloading = False
        downloader.cancelled_tasks = set()
        downloader.queue = []

        self.assertFalse(downloader.start_engine({}, [{
            "id": "task_1",
            "url": "file:///C:/Windows/win.ini",
        }]))
        self.assertFalse(downloader.is_downloading)


if __name__ == "__main__":
    unittest.main()
