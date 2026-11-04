import unittest

from core.validation import (
    is_allowed_local_api_origin,
    is_http_url,
    is_safe_task_id,
    is_trusted_extension_origin,
    is_trusted_update_redirect_url,
    is_trusted_update_url,
    sanitize_path_component,
)


class ValidationTests(unittest.TestCase):
    def test_accepts_only_chrome_extension_origins(self):
        self.assertTrue(is_trusted_extension_origin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))
        self.assertFalse(is_trusted_extension_origin("https://example.com"))
        self.assertFalse(is_trusted_extension_origin("chrome-extension://invalid-id"))

    def test_local_api_origin_allowlist(self):
        self.assertTrue(is_allowed_local_api_origin("chrome-extension://abcdefghijklmnopabcdefghijklmnop"))
        self.assertTrue(is_allowed_local_api_origin("https://www3.animeflv.net"))
        self.assertTrue(is_allowed_local_api_origin("https://player.streamtape.com"))
        self.assertFalse(is_allowed_local_api_origin("https://example.com"))
        self.assertFalse(is_allowed_local_api_origin("https://evilstreamtape.com"))
        self.assertFalse(is_allowed_local_api_origin("null"))
        self.assertTrue(is_allowed_local_api_origin("https://animeflv.net"))
        self.assertFalse(is_allowed_local_api_origin("https://animeflv.net:8443"))

    def test_auto_update_urls_are_restricted_to_github(self):
        self.assertTrue(is_trusted_update_url(
            "https://github.com/Manolilloo/Aurion/releases/download/v1.2.0/Aurion.zip"
        ))
        self.assertFalse(is_trusted_update_url(
            "https://github.com:8443/Manolilloo/Aurion/releases/download/v1/Aurion.zip"
        ))
        self.assertFalse(is_trusted_update_url("https://evil.example/Aurion.zip"))
        self.assertTrue(is_trusted_update_redirect_url(
            "https://release-assets.githubusercontent.com/asset.zip"
        ))
        self.assertFalse(is_trusted_update_redirect_url(
            "https://release-assets.githubusercontent.com:8443/asset.zip"
        ))

    def test_http_url_validation(self):
        self.assertTrue(is_http_url("https://example.com/video.m3u8?token=a"))
        self.assertFalse(is_http_url("http://203.0.113.10/media"))
        self.assertFalse(is_http_url("http://localhost:8080/media"))
        self.assertFalse(is_http_url("http://127.0.0.1:8080/media"))
        self.assertFalse(is_http_url("file:///C:/secret.txt"))
        self.assertFalse(is_http_url("javascript:alert(1)"))
        self.assertFalse(is_http_url("https://user:password@example.com/"))
        self.assertFalse(is_http_url("https://example.com/" + "a" * 9000))
        self.assertFalse(is_http_url("https://example.com/\nmalicious"))

    def test_task_ids_are_safe_path_components(self):
        self.assertTrue(is_safe_task_id("task_1730748200_ab12"))
        self.assertFalse(is_safe_task_id("../config"))
        self.assertFalse(is_safe_task_id("task 1"))
        self.assertFalse(is_safe_task_id(""))

    def test_filename_sanitization(self):
        self.assertEqual(sanitize_path_component("../../movie"), ".._.._movie")
        self.assertEqual(sanitize_path_component("CON"), "_CON")
        self.assertEqual(sanitize_path_component("trailing. "), "trailing")
        self.assertEqual(sanitize_path_component(""), "video")


if __name__ == "__main__":
    unittest.main()
