import os
import tempfile
import unittest

from core.downloader import AurionDownloader


class DownloaderPathTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.base = os.path.abspath(self.temp_dir.name)
        self.downloader = object.__new__(AurionDownloader)

    def tearDown(self):
        self.temp_dir.cleanup()

    def assert_inside_base(self, path):
        path = os.path.abspath(path)
        self.assertEqual(os.path.normcase(os.path.commonpath([self.base, path])), os.path.normcase(self.base))

    def test_movie_title_cannot_escape_destination(self):
        result = self.downloader.resolve_destination_folder({
            "dir": self.base,
            "active_mode": "movie",
            "title": "../../outside",
        })
        self.assert_inside_base(result)
        self.assertTrue(os.path.isdir(result))

    def test_windows_reserved_title_is_sanitized(self):
        result = self.downloader.resolve_destination_folder({
            "dir": self.base,
            "active_mode": "movie",
            "title": "CON",
        })
        self.assert_inside_base(result)
        self.assertEqual(os.path.basename(result), "_CON")

    def test_anime_season_folder_stays_inside_destination(self):
        result = self.downloader.resolve_destination_folder({
            "dir": self.base,
            "active_mode": "anime",
            "title": "../../Series Season 2",
            "season_num": 2,
        })
        self.assert_inside_base(result)
        self.assertTrue(os.path.basename(result).startswith("Temporada "))


if __name__ == "__main__":
    unittest.main()
