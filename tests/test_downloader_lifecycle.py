import threading
import unittest

from core.downloader import AurionDownloader


class DownloaderLifecycleTests(unittest.TestCase):
    def test_orchestrator_releases_running_state_after_setup_error(self):
        downloader = object.__new__(AurionDownloader)
        downloader.lock = threading.Lock()
        downloader.is_downloading = True
        downloader.cancelled_tasks = {"task_1"}
        downloader.active_task_ids = set()
        downloader.bridge = None

        def raise_setup_error(_config):
            raise OSError("simulated destination failure")

        downloader.resolve_destination_folder = raise_setup_error
        downloader._orchestrate_downloads({}, [])

        self.assertFalse(downloader.is_downloading)
        self.assertEqual(downloader.cancelled_tasks, set())
        self.assertEqual(downloader.fragment_limiter.snapshot()["active_tasks"], 0)

    def test_cleanup_defers_temp_deletion_and_cancels_active_tasks(self):
        import os
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            active_dir = os.path.join(root, ".tmp_task_1")
            os.makedirs(active_dir)
            downloader = object.__new__(AurionDownloader)
            downloader.lock = threading.Lock()
            downloader.is_downloading = True
            downloader.cancelled_tasks = set()
            downloader.active_task_ids = {"task_1"}
            downloader.active_temp_dirs = {active_dir}
            removed = []
            downloader._force_remove_temp_dir = removed.append

            cleaned = downloader.cleanup_all_temp()

            self.assertFalse(cleaned)
            self.assertEqual(downloader.cancelled_tasks, {"task_1"})
            self.assertEqual(downloader.active_temp_dirs, {active_dir})
            self.assertTrue(os.path.isdir(active_dir))
            self.assertEqual(removed, [])

    def test_cleanup_removes_temp_dirs_only_after_batch_stops(self):
        import os
        import tempfile

        with tempfile.TemporaryDirectory() as root:
            active_dir = os.path.join(root, ".tmp_task_1")
            os.makedirs(active_dir)
            downloader = object.__new__(AurionDownloader)
            downloader.lock = threading.Lock()
            downloader.is_downloading = False
            downloader.cancelled_tasks = set()
            downloader.active_task_ids = set()
            downloader.active_temp_dirs = {active_dir}
            removed = []

            def remove_directory(path):
                removed.append(path)
                downloader.active_temp_dirs.discard(path)

            downloader._force_remove_temp_dir = remove_directory

            self.assertTrue(downloader.cleanup_all_temp())
            self.assertEqual(removed, [active_dir])
            self.assertEqual(downloader.active_temp_dirs, set())

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
