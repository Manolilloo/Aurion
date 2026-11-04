import json
import os
import tempfile
import threading
import unittest
from unittest.mock import patch

from core.bridge import AurionBridge


class ConfigPersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.config_path = os.path.join(self.temp_dir.name, "config.json")
        self.bridge = object.__new__(AurionBridge)
        self.bridge._config_lock = threading.RLock()
        self.bridge.config = {
            "app_version": "0.0.0",
            "anime": {"dir": "C:/Videos/Anime", "active_title": ""},
            "settings": {"sound_effects": True, "speed_limit": "0"},
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_save_config_merges_and_writes_valid_json_atomically(self):
        with patch("core.bridge.CONFIG_FILE", self.config_path):
            self.assertTrue(self.bridge.save_config({
                "anime": {"active_title": "Example"},
                "settings": {"speed_limit": "5M"},
            }))

        with open(self.config_path, "r", encoding="utf-8") as stream:
            saved = json.load(stream)

        self.assertEqual(saved["app_version"], "1.2.0")
        self.assertEqual(saved["anime"]["dir"], "C:/Videos/Anime")
        self.assertEqual(saved["anime"]["active_title"], "Example")
        self.assertTrue(saved["settings"]["sound_effects"])
        self.assertEqual(saved["settings"]["speed_limit"], "5M")
        self.assertFalse(os.path.exists(self.config_path + ".tmp"))

    def test_concurrent_config_writes_leave_valid_json(self):
        with patch("core.bridge.CONFIG_FILE", self.config_path):
            threads = [
                threading.Thread(
                    target=self.bridge.save_config,
                    args=({"settings": {f"setting_{index}": index}},),
                )
                for index in range(12)
            ]
            for thread in threads:
                thread.start()
            for thread in threads:
                thread.join(timeout=5)
                self.assertFalse(thread.is_alive())

        with open(self.config_path, "r", encoding="utf-8") as stream:
            saved = json.load(stream)
        self.assertTrue(all(saved["settings"][f"setting_{index}"] == index for index in range(12)))


if __name__ == "__main__":
    unittest.main()
