import os
import tempfile
import unittest
from unittest.mock import patch

from core.paths import get_app_data_dir, get_app_data_file


class AppDataPathTests(unittest.TestCase):
    def test_uses_local_app_data_on_windows(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"LOCALAPPDATA": root}, clear=True):
                self.assertEqual(get_app_data_dir(), os.path.join(root, "Aurion"))

    def test_migrates_legacy_file_when_destination_is_missing(self):
        with tempfile.TemporaryDirectory() as root:
            local = os.path.join(root, "local")
            legacy = os.path.join(root, "project", "config.json")
            os.makedirs(os.path.dirname(legacy))
            with open(legacy, "w", encoding="utf-8") as stream:
                stream.write('{"theme": "dark"}')

            with patch.dict(os.environ, {"LOCALAPPDATA": local}, clear=True):
                destination = get_app_data_file("config.json", legacy_path=legacy)

            self.assertEqual(destination, os.path.join(local, "Aurion", "config.json"))
            with open(destination, "r", encoding="utf-8") as stream:
                self.assertEqual(stream.read(), '{"theme": "dark"}')

    def test_does_not_overwrite_existing_user_data(self):
        with tempfile.TemporaryDirectory() as root:
            local = os.path.join(root, "local")
            app_data = os.path.join(local, "Aurion")
            os.makedirs(app_data)
            destination = os.path.join(app_data, "config.json")
            with open(destination, "w", encoding="utf-8") as stream:
                stream.write('{"theme": "light"}')

            legacy = os.path.join(root, "config.json")
            with open(legacy, "w", encoding="utf-8") as stream:
                stream.write('{"theme": "dark"}')

            with patch.dict(os.environ, {"LOCALAPPDATA": local}, clear=True):
                self.assertEqual(get_app_data_file("config.json", legacy), destination)

            with open(destination, "r", encoding="utf-8") as stream:
                self.assertEqual(stream.read(), '{"theme": "light"}')

    def test_rejects_path_traversal_in_filename(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.dict(os.environ, {"LOCALAPPDATA": root}, clear=True):
                with self.assertRaises(ValueError):
                    get_app_data_file("../config.json")


if __name__ == "__main__":
    unittest.main()
