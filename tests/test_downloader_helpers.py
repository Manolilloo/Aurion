import unittest

from core.downloader import AurionDownloader, parse_speed_limit_bytes, parse_time_to_seconds


class DownloaderHelperTests(unittest.TestCase):
    def test_speed_limit_parser(self):
        self.assertIsNone(parse_speed_limit_bytes("0"))
        self.assertIsNone(parse_speed_limit_bytes(""))
        self.assertEqual(parse_speed_limit_bytes("5M"), 5 * 1024 * 1024)
        self.assertEqual(parse_speed_limit_bytes("1.5G"), int(1.5 * 1024 ** 3))
        self.assertEqual(parse_speed_limit_bytes("512K"), 512 * 1024)
        self.assertIsNone(parse_speed_limit_bytes("not-a-limit"))

    def test_time_parser(self):
        self.assertEqual(parse_time_to_seconds("01:30"), 90)
        self.assertEqual(parse_time_to_seconds("01:02:03"), 3723)
        self.assertEqual(parse_time_to_seconds("42"), 42)
        self.assertIsNone(parse_time_to_seconds(""))
        self.assertIsNone(parse_time_to_seconds("n/a"))

    def test_limited_response_rejects_private_redirects_and_large_bodies(self):
        downloader = object.__new__(AurionDownloader)

        class FakeResponse:
            def __init__(self, url, body):
                self.url = url
                self.body = body

            def geturl(self):
                return self.url

            def read(self, size=-1):
                return self.body[:size]

        self.assertEqual(
            downloader._read_limited_response(
                FakeResponse("https://media.example/video", b"small"),
                max_bytes=10,
            ),
            b"small",
        )
        with self.assertRaises(ValueError):
            downloader._read_limited_response(
                FakeResponse("http://127.0.0.1/admin", b"bad"),
                max_bytes=10,
            )
        with self.assertRaises(ValueError):
            downloader._read_limited_response(
                FakeResponse("https://media.example/large", b"x" * 11),
                max_bytes=10,
            )


if __name__ == "__main__":
    unittest.main()
