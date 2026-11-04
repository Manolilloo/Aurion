import unittest

from core.download_profiles import (
    build_download_profile,
    effective_parallel_downloads,
    fragment_fallback_levels,
    is_retryable_segment_error,
)


class DownloadProfileTests(unittest.TestCase):
    def test_hls_uses_fragment_downloader_and_caps_concurrency(self):
        profile = build_download_profile(
            "https://cdn.example/master.m3u8?token=abc",
            configured_threads=64,
            configured_aria_connections=16,
            has_aria2=True,
        )

        self.assertEqual(profile.protocol, "hls")
        self.assertEqual(profile.fragment_workers, 16)
        self.assertFalse(profile.use_aria2)
        self.assertEqual(profile.aria_connections, 0)

    def test_dash_is_not_sent_to_aria2(self):
        profile = build_download_profile(
            "https://cdn.example/manifest.mpd?session=abc",
            has_aria2=True,
        )

        self.assertEqual(profile.protocol, "dash")
        self.assertFalse(profile.use_aria2)
        self.assertEqual(profile.fragment_workers, 16)

    def test_token_sensitive_hosts_are_limited_to_four_connections(self):
        profile = build_download_profile(
            "https://cdn.streamtape.com/video.mp4",
            configured_aria_connections=16,
            has_aria2=True,
        )

        self.assertEqual(profile.host_class, "token-sensitive")
        self.assertTrue(profile.use_aria2)
        self.assertEqual(profile.aria_connections, 4)

    def test_mp4upload_is_limited_to_eight_connections(self):
        profile = build_download_profile(
            "https://www.mp4upload.com/video.mp4",
            configured_aria_connections=16,
            has_aria2=True,
        )

        self.assertEqual(profile.host_class, "mp4upload")
        self.assertEqual(profile.aria_connections, 8)

    def test_standard_direct_file_keeps_user_connection_setting(self):
        profile = build_download_profile(
            "https://files.example/video.mp4",
            configured_aria_connections=12,
            has_aria2=True,
        )

        self.assertEqual(profile.protocol, "http")
        self.assertTrue(profile.use_aria2)
        self.assertEqual(profile.aria_connections, 12)

    def test_youtube_keeps_its_own_profile(self):
        profile = build_download_profile(
            "https://www.youtube.com/watch?v=example",
            configured_threads=64,
            has_aria2=True,
            is_youtube=True,
        )

        self.assertEqual(profile.protocol, "youtube")
        self.assertFalse(profile.use_aria2)
        self.assertEqual(profile.fragment_workers, 8)

    def test_fragment_workers_share_budget_across_simultaneous_downloads(self):
        single = build_download_profile(
            "https://cdn.example/master.m3u8",
            configured_threads=64,
            simultaneous_downloads=1,
        )
        batch = build_download_profile(
            "https://cdn.example/master.m3u8",
            configured_threads=64,
            simultaneous_downloads=8,
        )

        self.assertEqual(single.fragment_workers, 16)
        self.assertEqual(batch.fragment_workers, 4)

    def test_aria2_connections_scale_with_batch_size(self):
        profile = build_download_profile(
            "https://files.example/video.mp4",
            configured_aria_connections=16,
            has_aria2=True,
            simultaneous_downloads=4,
        )

        self.assertEqual(profile.aria_connections, 8)

    def test_effective_parallel_downloads_respects_actual_batch_size(self):
        self.assertEqual(effective_parallel_downloads(8, 1), 1)
        self.assertEqual(effective_parallel_downloads(3, 10), 3)
        self.assertEqual(effective_parallel_downloads(20, 20), 8)
        self.assertEqual(effective_parallel_downloads(4, 0), 0)

    def test_fragment_fallback_levels_reduce_concurrency_safely(self):
        self.assertEqual(fragment_fallback_levels(16), (8, 4))
        self.assertEqual(fragment_fallback_levels(8), (4,))
        self.assertEqual(fragment_fallback_levels(4), ())

    def test_only_transient_segment_errors_trigger_recovery(self):
        self.assertTrue(is_retryable_segment_error("HTTP Error 503: Service Unavailable"))
        self.assertTrue(is_retryable_segment_error("Unable to download a fragment"))
        self.assertFalse(is_retryable_segment_error("HTTP Error 403: Forbidden"))
        self.assertFalse(is_retryable_segment_error("Unsupported URL"))

    def test_invalid_settings_use_safe_defaults(self):
        profile = build_download_profile(
            "https://files.example/video.mp4",
            configured_aria_connections="invalid",
            has_aria2=True,
        )

        self.assertEqual(profile.aria_connections, 16)


if __name__ == "__main__":
    unittest.main()
