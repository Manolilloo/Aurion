import os
import tempfile
import unittest
import zipfile

from core.updates import UnsafeUpdateArchive, release_zip_asset_url, safe_extract_zip
from core.validation import is_trusted_update_url


class UpdateSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = self.temp_dir.name
        self.archive = os.path.join(self.root, "update.zip")
        self.destination = os.path.join(self.root, "staging")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_accepts_only_official_aurion_release_urls(self):
        self.assertTrue(is_trusted_update_url(
            "https://github.com/Manolilloo/Aurion/releases/download/v1.2.0/Aurion-v1.2.0.zip"
        ))
        self.assertFalse(is_trusted_update_url(
            "https://api.github.com/repos/Manolilloo/Aurion/zipball/v1.2.0"
        ))
        self.assertFalse(is_trusted_update_url("http://github.com/Manolilloo/Aurion/releases/download/v1.2.0/a.zip"))
        self.assertFalse(is_trusted_update_url("https://evil.example/Aurion.zip"))
        self.assertFalse(is_trusted_update_url("https://github.com/other/repo/releases/download/v1/a.zip"))

    def test_release_uses_only_uploaded_installable_zip_assets(self):
        release = {
            "zipball_url": "https://api.github.com/repos/Manolilloo/Aurion/zipball/v1.2.0",
            "assets": [
                {"name": "checksums.txt", "browser_download_url": "https://github.com/Manolilloo/Aurion/releases/download/v1/checksums.txt"},
                {"name": "Aurion-v1.2.0.zip", "browser_download_url": "https://github.com/Manolilloo/Aurion/releases/download/v1.2.0/Aurion-v1.2.0.zip"},
            ],
        }
        self.assertEqual(
            release_zip_asset_url(release),
            "https://github.com/Manolilloo/Aurion/releases/download/v1.2.0/Aurion-v1.2.0.zip",
        )

    def test_release_without_uploaded_zip_has_no_installer_url(self):
        release = {
            "zipball_url": "https://api.github.com/repos/Manolilloo/Aurion/zipball/v1.2.0",
            "assets": [{"name": "checksums.txt", "browser_download_url": "https://github.com/Manolilloo/Aurion/releases/download/v1/checksums.txt"}],
        }
        self.assertIsNone(release_zip_asset_url(release))
        self.assertIsNone(release_zip_asset_url(None))

    def test_extracts_a_normal_archive(self):
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Aurion.exe", b"application")
            archive.writestr("_internal/core.py", b"print('ok')")
        count = safe_extract_zip(self.archive, self.destination)
        self.assertEqual(count, 2)
        with open(os.path.join(self.destination, "Aurion.exe"), "rb") as file:
            self.assertEqual(file.read(), b"application")

    def test_rejects_parent_directory_traversal(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("../outside.txt", b"bad")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)
        self.assertFalse(os.path.exists(os.path.join(self.root, "outside.txt")))

    def test_rejects_absolute_windows_paths(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("C:\\Windows\\win.ini", b"bad")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)

    def test_rejects_archives_with_excessive_expansion(self):
        with zipfile.ZipFile(self.archive, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("large.txt", b"x" * 4096)
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination, max_uncompressed_bytes=1024)

    def test_rejects_windows_alternate_data_streams(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("Aurion.exe:payload", b"bad")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)

    def test_rejects_reserved_windows_device_names(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("_internal/CON.txt", b"bad")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)

    def test_rejects_windows_trailing_dot_or_space(self):
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr("folder./file.txt", b"bad")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)

    def test_rejects_symbolic_link_entries(self):
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (0o120777 << 16)
        with zipfile.ZipFile(self.archive, "w") as archive:
            archive.writestr(link, "target")
        with self.assertRaises(UnsafeUpdateArchive):
            safe_extract_zip(self.archive, self.destination)


if __name__ == "__main__":
    unittest.main()
