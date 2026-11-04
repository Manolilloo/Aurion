import os
import tempfile
import unittest
from unittest.mock import patch

from core.database import AurionDatabase


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "history.sqlite3")
        self.db_patch = patch("core.database.DB_FILE", self.db_path)
        self.db_patch.start()
        self.db = AurionDatabase()

    def tearDown(self):
        self.db_patch.stop()
        self.temp_dir.cleanup()

    def test_logs_and_reads_download(self):
        self.assertTrue(self.db.log_download(
            title="Test episode",
            mode="anime",
            resolution="1080p",
            size_bytes=123456,
            file_path=os.path.join(self.temp_dir.name, "episode.mkv"),
            source_url="https://example.com/episode.m3u8",
        ))
        result = self.db.get_history()
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["title"], "Test episode")
        self.assertEqual(result["stats"]["total_count"], 1)
        self.assertEqual(result["stats"]["total_bytes"], 123456)

    def test_filters_history(self):
        self.db.log_download("Anime One", "anime", "720p", 100, "a.mkv")
        self.db.log_download("Movie One", "movie", "1080p", 200, "b.mp4")
        self.assertEqual(len(self.db.get_history(mode_filter="movie")["items"]), 1)
        self.assertEqual(len(self.db.get_history(search_query="Anime")["items"]), 1)

    def test_delete_and_clear(self):
        self.db.log_download("Delete me", "youtube", "MP3", 50, "a.mp3")
        item_id = self.db.get_history()["items"][0]["id"]
        self.assertTrue(self.db.delete_entry(item_id))
        self.db.log_download("Clear me", "youtube", "MP3", 50, "b.mp3")
        self.assertTrue(self.db.clear_all())
        self.assertEqual(self.db.get_history()["stats"]["total_count"], 0)


if __name__ == "__main__":
    unittest.main()
